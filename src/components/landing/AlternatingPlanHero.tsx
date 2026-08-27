"use client";

import React, { useEffect, useRef, useMemo, useState } from 'react';
import { Heerich } from 'heerich';
import { gsap } from 'gsap';

export function AlternatingPlanHero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svg2dRef = useRef<SVGSVGElement>(null);
  const container3dRef = useRef<HTMLDivElement>(null);

  // 1. Generate 3D Voxel Scene SVG Markup
  const svg3dMarkup = useMemo(() => {
    const h = new Heerich({
      tile: [32, 32],
      camera: { type: 'oblique', angle: -45, distance: 11 }
    });

    const slabStyle = {
      default: { stroke: '#2c2921', strokeWidth: 1 },
      top: { fill: '#1d1b16' }, 
      front: { fill: '#171511' }, 
      right: { fill: '#12110e' }, 
    };

    const sandcreteStyle = {
      default: { stroke: '#2c2921', strokeWidth: 1 },
      top: { fill: '#8b8471' }, 
      front: { fill: '#706b5a' }, 
      right: { fill: '#555246' }, 
    };

    const lateriteStyle = {
      default: { stroke: '#2c2921', strokeWidth: 1 },
      top: { fill: '#ca6c4c' }, 
      front: { fill: '#b25a3d' }, 
      right: { fill: '#92482f' }, 
    };

    const lintelStyle = {
      default: { stroke: '#2c2921', strokeWidth: 1 },
      top: { fill: '#c9a96a' }, 
      front: { fill: '#b39458' }, 
      right: { fill: '#967b45' }, 
    };

    // Base Slab (y = 1)
    h.addBox({ position: [-1, 1, -1], size: [8, 1, 8], style: slabStyle });

    // Exterior walls (sandcrete) - Back wall (z = 0)
    for (let x = 0; x <= 5; x++) {
      h.addBox({ position: [x, 0, 0], size: [1, 1, 1], style: sandcreteStyle });
      if (x !== 2 && x !== 3) {
        h.addBox({ position: [x, -1, 0], size: [1, 1, 1], style: sandcreteStyle });
      }
      h.addBox({ position: [x, -2, 0], size: [1, 1, 1], style: lintelStyle });
    }

    // Exterior walls - Left wall (x = 0)
    for (let z = 1; z <= 5; z++) {
      h.addBox({ position: [0, 0, z], size: [1, 1, 1], style: sandcreteStyle });
      if (z !== 2) {
        h.addBox({ position: [0, -1, z], size: [1, 1, 1], style: sandcreteStyle });
      }
      h.addBox({ position: [0, -2, z], size: [1, 1, 1], style: lintelStyle });
    }

    // Exterior walls - Right wall (x = 5)
    for (let z = 1; z <= 5; z++) {
      h.addBox({ position: [5, 0, z], size: [1, 1, 1], style: sandcreteStyle });
      if (z !== 2) {
        h.addBox({ position: [5, -1, z], size: [1, 1, 1], style: sandcreteStyle });
      }
      h.addBox({ position: [5, -2, z], size: [1, 1, 1], style: lintelStyle });
    }

    // Exterior walls - Front wall (z = 5)
    // Door opening at x = 2, 3
    h.addBox({ position: [1, 0, 5], size: [1, 1, 1], style: sandcreteStyle });
    h.addBox({ position: [1, -1, 5], size: [1, 1, 1], style: sandcreteStyle });
    h.addBox({ position: [1, -2, 5], size: [1, 1, 1], style: lintelStyle });

    h.addBox({ position: [2, -2, 5], size: [1, 1, 1], style: lintelStyle });
    h.addBox({ position: [3, -2, 5], size: [1, 1, 1], style: lintelStyle });

    h.addBox({ position: [4, 0, 5], size: [1, 1, 1], style: sandcreteStyle });
    h.addBox({ position: [4, -1, 5], size: [1, 1, 1], style: sandcreteStyle });
    h.addBox({ position: [4, -2, 5], size: [1, 1, 1], style: lintelStyle });

    // Interior partitions (laterite) - Divider at x = 3
    h.addBox({ position: [3, 0, 1], size: [1, 1, 1], style: lateriteStyle });
    h.addBox({ position: [3, -1, 1], size: [1, 1, 1], style: lateriteStyle });
    h.addBox({ position: [3, -2, 1], size: [1, 1, 1], style: lintelStyle });

    // Doorway at z = 2 (no walls below lintel)
    h.addBox({ position: [3, -2, 2], size: [1, 1, 1], style: lintelStyle });

    h.addBox({ position: [3, 0, 3], size: [1, 1, 1], style: lateriteStyle });
    h.addBox({ position: [3, -1, 3], size: [1, 1, 1], style: lateriteStyle });
    h.addBox({ position: [3, -2, 3], size: [1, 1, 1], style: lintelStyle });

    h.addBox({ position: [3, 0, 4], size: [1, 1, 1], style: lateriteStyle });
    h.addBox({ position: [3, -1, 4], size: [1, 1, 1], style: lateriteStyle });
    h.addBox({ position: [3, -2, 4], size: [1, 1, 1], style: lintelStyle });

    return h.toSVG({ padding: 20 });
  }, []);

  // 2. Setup Looping Animation Timeline
  useEffect(() => {
    if (!svg2dRef.current || !container3dRef.current) return;

    // Select elements from 2D Plan
    const gridLines = svg2dRef.current.querySelectorAll('.grid-line');
    const wallLines = svg2dRef.current.querySelectorAll('.wall-line');
    const doorLines = svg2dRef.current.querySelectorAll('.door-line');
    const labels = svg2dRef.current.querySelectorAll('.text-label');

    // Select polygons from 3D Voxel Plan
    const polygons = container3dRef.current.querySelectorAll('polygon');

    // Group 3D polygons by their Y coordinates
    const slabPolys: SVGPolygonElement[] = [];
    const basePolys: SVGPolygonElement[] = [];
    const midPolys: SVGPolygonElement[] = [];
    const topPolys: SVGPolygonElement[] = [];

    polygons.forEach((poly) => {
      const yAttr = poly.getAttribute('data-y');
      if (yAttr === '1') {
        slabPolys.push(poly);
      } else if (yAttr === '0') {
        basePolys.push(poly);
      } else if (yAttr === '-1') {
        midPolys.push(poly);
      } else if (yAttr === '-2') {
        topPolys.push(poly);
      } else {
        // Fallback or other levels
        basePolys.push(poly);
      }
    });

    // Set initial states
    gsap.set([gridLines, wallLines, doorLines, labels], { opacity: 0 });
    gsap.set(polygons, { opacity: 0, scaleY: 0, transformOrigin: '50% 100%' });
    gsap.set(container3dRef.current, { opacity: 0 });

    const tl = gsap.timeline({ repeat: -1 });

    // --- PHASE 1: Draw 2D Floor Plan ---
    tl.addLabel('start2d');
    tl.to(gridLines, { opacity: 0.15, duration: 0.8, stagger: 0.05, ease: 'power1.out' });
    tl.to(wallLines, { 
      opacity: 1, 
      strokeDashoffset: 0, 
      duration: 1.5, 
      stagger: 0.1, 
      ease: 'power2.inOut',
      onStart: () => {
        wallLines.forEach(line => {
          if (line instanceof SVGLineElement || line instanceof SVGRectElement) {
            const len = line.getTotalLength ? line.getTotalLength() : 400;
            line.style.strokeDasharray = `${len}`;
            line.style.strokeDashoffset = `${len}`;
          }
        });
      }
    }, '-=0.5');
    tl.to(doorLines, { opacity: 0.6, duration: 0.6, ease: 'power1.out' }, '-=0.3');
    tl.to(labels, { opacity: 1, duration: 0.6, ease: 'power1.out' }, '-=0.2');
    
    // Hold 2D state for 3 seconds
    tl.delay(3);

    // --- PHASE 2: Transition & Lift to 3D Voxel Plan ---
    tl.addLabel('transition');
    // Fade out 2D text labels, door lines, and dim grid lines
    tl.to([labels, doorLines], { opacity: 0, duration: 0.6, ease: 'power2.inOut' });
    tl.to(wallLines, { opacity: 0.2, duration: 0.8, ease: 'power2.inOut' }, '-=0.4');
    
    // Show 3D container
    tl.to(container3dRef.current, { opacity: 1, duration: 0.4 }, '-=0.4');

    // Build the 3D voxels from the bottom up!
    // Slab fades in and lifts slightly
    tl.fromTo(slabPolys, 
      { opacity: 0, scaleY: 0, y: 30 },
      { opacity: 1, scaleY: 1, y: 0, duration: 0.8, stagger: 0.005, ease: 'back.out(1.2)' },
      '-=0.2'
    );
    
    // Base layer of walls (y = 0)
    tl.fromTo(basePolys,
      { opacity: 0, scaleY: 0, y: 20 },
      { opacity: 1, scaleY: 1, y: 0, duration: 0.6, stagger: 0.01, ease: 'power2.out' },
      '-=0.4'
    );

    // Middle layer of walls (y = -1)
    tl.fromTo(midPolys,
      { opacity: 0, scaleY: 0, y: 15 },
      { opacity: 1, scaleY: 1, y: 0, duration: 0.5, stagger: 0.01, ease: 'power2.out' },
      '-=0.3'
    );

    // Top/Lintel layer of walls (y = -2)
    tl.fromTo(topPolys,
      { opacity: 0, scaleY: 0, y: 10 },
      { opacity: 1, scaleY: 1, y: 0, duration: 0.5, stagger: 0.01, ease: 'power2.out' },
      '-=0.3'
    );

    // Hold 3D state for 4 seconds
    tl.to({}, { duration: 4 });

    // --- PHASE 3: Collapse and Loop back ---
    tl.addLabel('collapse');
    // Animate all 3D components sinking down and fading out
    tl.to([topPolys, midPolys, basePolys, slabPolys], {
      opacity: 0,
      scaleY: 0,
      y: 20,
      duration: 0.8,
      stagger: {
        amount: 0.4,
        from: 'end'
      },
      ease: 'power2.in'
    });
    tl.to(container3dRef.current, { opacity: 0, duration: 0.4 }, '-=0.2');
    
    // Fade grid and wall lines back down to reset
    tl.to([gridLines, wallLines], { opacity: 0, duration: 0.6, ease: 'power2.in' }, '-=0.4');

    return () => {
      tl.kill();
    };
  }, [svg3dMarkup]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full aspect-square max-w-[460px] mx-auto rounded-2xl border border-[#2c2921] bg-[#161511] shadow-2xl p-6 flex items-center justify-center overflow-hidden group"
    >
      {/* Background Decorative blueprint details */}
      <div className="absolute top-4 left-4 text-[10px] font-mono text-[#8b8471]/30 select-none uppercase tracking-widest">
        Redesign Redux // Red-Green-Refactor
      </div>
      <div className="absolute bottom-4 right-4 text-[10px] font-mono text-[#8b8471]/30 select-none uppercase tracking-widest">
        Scale: 1:50 Oblique
      </div>

      {/* Layer 1: 2D Floor Plan (SVG) */}
      <svg
        ref={svg2dRef}
        viewBox="0 0 400 400"
        className="absolute inset-0 w-full h-full p-8 z-10 pointer-events-none select-none"
      >
        {/* Fine Blueprint Grid */}
        <g className="grid-line opacity-10">
          <line x1="50" y1="0" x2="50" y2="400" stroke="#8b8471" strokeWidth="0.5" strokeDasharray="2,4" />
          <line x1="100" y1="0" x2="100" y2="400" stroke="#8b8471" strokeWidth="0.5" strokeDasharray="2,4" />
          <line x1="150" y1="0" x2="150" y2="400" stroke="#8b8471" strokeWidth="0.5" strokeDasharray="2,4" />
          <line x1="200" y1="0" x2="200" y2="400" stroke="#8b8471" strokeWidth="0.5" strokeDasharray="2,4" />
          <line x1="250" y1="0" x2="250" y2="400" stroke="#8b8471" strokeWidth="0.5" strokeDasharray="2,4" />
          <line x1="300" y1="0" x2="300" y2="400" stroke="#8b8471" strokeWidth="0.5" strokeDasharray="2,4" />
          <line x1="350" y1="0" x2="350" y2="400" stroke="#8b8471" strokeWidth="0.5" strokeDasharray="2,4" />
          
          <line x1="0" y1="50" x2="400" y2="50" stroke="#8b8471" strokeWidth="0.5" strokeDasharray="2,4" />
          <line x1="0" y1="100" x2="400" y2="100" stroke="#8b8471" strokeWidth="0.5" strokeDasharray="2,4" />
          <line x1="0" y1="150" x2="400" y2="150" stroke="#8b8471" strokeWidth="0.5" strokeDasharray="2,4" />
          <line x1="0" y1="200" x2="400" y2="200" stroke="#8b8471" strokeWidth="0.5" strokeDasharray="2,4" />
          <line x1="0" y1="250" x2="400" y2="250" stroke="#8b8471" strokeWidth="0.5" strokeDasharray="2,4" />
          <line x1="0" y1="300" x2="400" y2="300" stroke="#8b8471" strokeWidth="0.5" strokeDasharray="2,4" />
          <line x1="0" y1="350" x2="400" y2="350" stroke="#8b8471" strokeWidth="0.5" strokeDasharray="2,4" />
        </g>

        {/* Outer Boundary Wall (Sandcrete) */}
        <rect
          x="80"
          y="80"
          width="240"
          height="240"
          fill="none"
          stroke="#ece7da"
          strokeWidth="6"
          strokeLinejoin="round"
          className="wall-line"
        />
        {/* Double-line architectural look for exterior walls */}
        <rect
          x="83"
          y="83"
          width="234"
          height="234"
          fill="none"
          stroke="#161511"
          strokeWidth="2"
          strokeLinejoin="round"
          className="wall-line"
        />

        {/* Interior Partition Wall (Laterite) */}
        <line
          x1="200"
          y1="80"
          x2="200"
          y2="320"
          stroke="#ca6c4c"
          strokeWidth="4"
          className="wall-line"
        />

        {/* Door and Window Openings in 2D */}
        {/* Front Door Opening */}
        <rect x="150" y="316" width="60" height="8" fill="#161511" />
        {/* Front Door Swing Arc */}
        <path
          d="M 150 320 A 50 50 0 0 1 200 270 L 200 320 Z"
          fill="none"
          stroke="#c9a96a"
          strokeWidth="1.5"
          strokeDasharray="2,2"
          className="door-line"
        />

        {/* Partition Door Swing Arc */}
        <path
          d="M 200 160 A 40 40 0 0 1 160 200 L 200 200 Z"
          fill="none"
          stroke="#c9a96a"
          strokeWidth="1.5"
          strokeDasharray="2,2"
          className="door-line"
        />

        {/* Window markings */}
        <line x1="80" y1="160" x2="80" y2="220" stroke="#161511" strokeWidth="6" />
        <line x1="77" y1="160" x2="77" y2="220" stroke="#8b8471" strokeWidth="1.5" className="wall-line" />
        <line x1="83" y1="160" x2="83" y2="220" stroke="#8b8471" strokeWidth="1.5" className="wall-line" />

        <line x1="320" y1="160" x2="320" y2="220" stroke="#161511" strokeWidth="6" />
        <line x1="317" y1="160" x2="317" y2="220" stroke="#8b8471" strokeWidth="1.5" className="wall-line" />
        <line x1="323" y1="160" x2="323" y2="220" stroke="#8b8471" strokeWidth="1.5" className="wall-line" />

        {/* Blueprint Room Labels */}
        <g className="text-label font-sans text-center">
          <text x="140" y="190" fill="#ece7da" fontSize="12" fontWeight="600" letterSpacing="1" textAnchor="middle">
            LIVING AREA
          </text>
          <text x="140" y="206" fill="#8b8471" fontSize="9" letterSpacing="0.5" textAnchor="middle">
            3.6m × 3.6m
          </text>
          
          <text x="260" y="190" fill="#ca6c4c" fontSize="12" fontWeight="600" letterSpacing="1" textAnchor="middle">
            BEDROOM
          </text>
          <text x="260" y="206" fill="#8b8471" fontSize="9" letterSpacing="0.5" textAnchor="middle">
            3.6m × 3.6m
          </text>
        </g>
      </svg>

      {/* Layer 2: 3D Voxel Plan (SVG from Heerich Engine) */}
      <div 
        ref={container3dRef}
        dangerouslySetInnerHTML={{ __html: svg3dMarkup }}
        className="absolute inset-0 w-full h-full p-4 flex items-center justify-center pointer-events-none select-none z-20"
      />
    </div>
  );
}
