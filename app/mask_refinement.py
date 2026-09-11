"""Adaptive, thickness-aware wall-mask smoothing, applied before
skeletonization -- attacks hatch-pattern boundary noise at its source
instead of post-processing the fragmented vector output it causes.

A fixed global smoothing kernel (tried earlier, rejected) damages thin
walls and doorway gaps: eating a few px off every boundary is harmless on a
20px-thick wall but can erase a thin partition or bridge a real opening
entirely. This module instead sizes safety per pixel from the mask's own
distance transform (local half-thickness) and only accepts the smoothed
value where the original mask was already comfortably thick there --
everywhere else (thin walls, door/window gaps, true boundary edges) keeps
the original, unsmoothed pixel untouched.
"""
import cv2
import numpy as np
from skimage.morphology import skeletonize


def _directional_smoothing(mask: np.ndarray, kernel_size: int) -> np.ndarray:
    """Remove one-pixel ripple while preserving horizontal/vertical runs."""
    horizontal_kernel = np.ones((1, kernel_size), np.uint8)
    vertical_kernel = np.ones((kernel_size, 1), np.uint8)
    # Opening is deliberately one-way: unlike closing, it cannot bridge a
    # narrow real doorway gap. The topology protection below restores source
    # pixels near real wall ends and junctions after the cleanup.
    horizontal = cv2.morphologyEx(mask, cv2.MORPH_OPEN, horizontal_kernel)
    vertical = cv2.morphologyEx(mask, cv2.MORPH_OPEN, vertical_kernel)
    # A genuine Manhattan wall survives at least one directional pass; a
    # one-pixel protrusion survives neither. This is less destructive than a
    # larger isotropic kernel on thin partitions.
    return np.logical_or(horizontal, vertical).astype(np.uint8)


def _gaussian_kernel_1d(sigma: float) -> np.ndarray:
    radius = max(1, int(round(sigma * 3)))
    x = np.arange(-radius, radius + 1)
    kernel = np.exp(-(x ** 2) / (2 * sigma ** 2))
    return kernel / kernel.sum()


def _smooth_closed_curve(points: np.ndarray, sigma: float) -> np.ndarray:
    """Low-pass filter a closed polygon's coordinates, treating each axis as
    a periodic 1D signal (wrap-around padding), to remove high-frequency
    boundary ripple while preserving the curve's overall, lower-frequency
    shape (including corners, at a small enough sigma)."""
    if len(points) < 5 or sigma <= 0:
        return points.astype(np.float64)
    kernel = _gaussian_kernel_1d(sigma)
    pad = len(kernel) // 2
    smoothed = np.empty_like(points, dtype=np.float64)
    for axis in range(2):
        padded = np.pad(points[:, axis].astype(np.float64), pad, mode="wrap")
        smoothed[:, axis] = np.convolve(padded, kernel, mode="valid")
    return smoothed


def _smooth_contour_boundary(mask: np.ndarray, sigma: float) -> np.ndarray:
    """Redraw every wall region with its boundary low-pass filtered, instead
    of morphologically eroding/dilating it.

    A sawtooth hatch-texture ripple is high spatial frequency along the
    boundary; a real wall edge (corners included) is comparatively low
    frequency -- this targets the noise directly in the domain it actually
    lives in, rather than approximating the same distinction through a
    fixed structuring-element radius. Each connected component (and any
    hole within it) is smoothed independently, so a real gap between two
    wall pieces on either side of a doorway can never be bridged -- there
    is no cross-component interaction for a gap to survive.
    """
    contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    canvas = np.zeros_like(mask)
    if not contours:
        return canvas
    smoothed = [
        np.round(_smooth_closed_curve(contour.reshape(-1, 2), sigma)).reshape(-1, 1, 2).astype(np.int32)
        for contour in contours
    ]
    # hierarchy[0][i] = [next, prev, firstChild, parent]; parent == -1 is an
    # outer boundary (fill it), otherwise it's a hole (cut it out). Draw all
    # outer boundaries first, then all holes, so draw order can never let a
    # later outer contour re-fill an earlier hole.
    outer = [smoothed[i] for i in range(len(smoothed)) if hierarchy[0][i][3] == -1]
    holes = [smoothed[i] for i in range(len(smoothed)) if hierarchy[0][i][3] != -1]
    cv2.drawContours(canvas, outer, -1, 1, thickness=cv2.FILLED)
    cv2.drawContours(canvas, holes, -1, 0, thickness=cv2.FILLED)
    return canvas


def _protected_topology(mask: np.ndarray, radius: int) -> np.ndarray:
    """Protect real skeleton ends and junctions from mask cleanup."""
    skeleton = skeletonize(mask.astype(bool)).astype(np.uint8)
    neighbors = cv2.filter2D(skeleton, cv2.CV_16S, np.ones((3, 3), np.int16)) - skeleton
    protected = np.logical_and(skeleton > 0, np.logical_or(neighbors == 1, neighbors >= 3)).astype(np.uint8)
    if radius > 0:
        protected = cv2.dilate(protected, np.ones((radius * 2 + 1, radius * 2 + 1), np.uint8))
    return protected.astype(bool)


def refine_wall_mask(wall_mask: np.ndarray, config: dict) -> np.ndarray:
    """Lightly smooth boundary ripple in thick wall regions only.

    config: {"kernelSizePx": int, "minThicknessPxForSmoothing": number}.
    minThicknessPxForSmoothing is a full-thickness value; a pixel is only
    eligible once its distance to the nearest non-wall pixel (i.e. local
    half-thickness) clears half of that.
    """
    mask = (wall_mask > 0).astype(np.uint8)
    if mask.sum() == 0:
        return wall_mask
    kernel_size = int(config.get("kernelSizePx", 3))
    kernel = np.ones((kernel_size, kernel_size), np.uint8)
    opened = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mode = config.get("mode")
    if mode == "directional-protected-v2":
        smoothed = _directional_smoothing(mask, kernel_size)
    elif mode == "contour-smooth-v3":
        smoothed = _smooth_contour_boundary(mask, float(config.get("boundarySmoothingSigmaPx", 1.2)))
    else:
        smoothed = cv2.morphologyEx(opened, cv2.MORPH_CLOSE, kernel)

    # A noise pixel (a hatch-texture spur or ripple) is, by definition, thin
    # right where it sits -- gating on the *unsmoothed* mask's own distance
    # transform there would always call it "unsafe" and leave it untouched,
    # defeating the point. Instead measure thickness on the *opened* mask
    # (which erosion has already stripped the noise from) and spread that
    # "this general area is a thick wall" classification outward by the
    # same kernel radius, so boundary noise immediately next to a thick
    # interior still gets classified as safe to smooth.
    distance_of_opened = cv2.distanceTransform(opened, cv2.DIST_L2, 5)
    spread_kernel = np.ones((kernel_size * 3, kernel_size * 3), np.uint8)
    thickness_nearby = cv2.dilate(distance_of_opened, spread_kernel)

    min_half_thickness = float(config.get("minThicknessPxForSmoothing", 6)) / 2
    safe_to_smooth = thickness_nearby >= min_half_thickness

    refined = np.where(safe_to_smooth, smoothed, mask)
    if config.get("mode") == "directional-protected-v2":
        # Skeletonize the *smoothed* candidate, not the raw noisy mask --
        # hatch-texture ripple creates spurious skeleton branches/junctions
        # of its own (this is the exact mechanism the whole refinement
        # exists to fix). Protecting junctions found in the raw mask means
        # protecting noise-induced fake junctions right along with real
        # ones, which defeats a large part of the cleanup. The smoothed
        # candidate has already had that ripple opened away, so its
        # skeleton's junctions are overwhelmingly genuine wall corners/tees.
        protected = _protected_topology(smoothed, int(config.get("topologyProtectionPx", 2)))
        refined = np.where(protected, mask, refined)
    return refined.astype(bool)
