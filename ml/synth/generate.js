#!/usr/bin/env node

/**
 * Procedural floor-plan generator for YOLO training data.
 *
 * Generates randomized rectangular room layouts (1-4 rooms with orthogonal walls),
 * places 0-3 doors and 0-4 windows on wall segments, renders as SVG via Playwright,
 * screenshots to PNG, and exports YOLO-format labels (normalized center-x/y/width/height
 * for wall/door/window classes matching CubiCasa5k's format).
 *
 * Output: ml/synth/output/images/synth_XXXX.png + ml/synth/output/labels/synth_XXXX.txt
 *
 * Usage:
 *   node generate.js [--count 800] [--seed 42] [--output-dir output]
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const CLASSES = { wall: 0, door: 1, window: 2 };
const SVG_WIDTH = 640;
const SVG_HEIGHT = 640;
const PADDING = 20;  // margin from SVG edges
const MIN_ROOM_SIZE = 60;
const MAX_ROOM_SIZE = 300;
const WALL_STROKE_WIDTH = 8;
const DOOR_WIDTH = 30;
const WINDOW_WIDTH = 25;

class SeededRandom {
  constructor(seed) {
    this.seed = seed;
  }
  next() {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
  nextInt(min, max) {
    return Math.floor(this.next() * (max - min)) + min;
  }
  choice(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

function generateRoomLayout(rng) {
  const numRooms = rng.nextInt(1, 5);  // 1-4 rooms
  const rooms = [];
  const maxAttempts = 20;

  for (let i = 0; i < numRooms; i++) {
    let placed = false;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = rng.nextInt(PADDING, SVG_WIDTH - MAX_ROOM_SIZE - PADDING);
      const y = rng.nextInt(PADDING, SVG_HEIGHT - MAX_ROOM_SIZE - PADDING);
      const width = rng.nextInt(MIN_ROOM_SIZE, MAX_ROOM_SIZE);
      const height = rng.nextInt(MIN_ROOM_SIZE, MAX_ROOM_SIZE);
      const room = { x, y, width, height, id: i };

      // Check for overlap with existing rooms
      let overlaps = false;
      for (const r of rooms) {
        if (
          x < r.x + r.width + 10 &&
          x + width > r.x - 10 &&
          y < r.y + r.height + 10 &&
          y + height > r.y - 10
        ) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps && x + width < SVG_WIDTH - PADDING && y + height < SVG_HEIGHT - PADDING) {
        rooms.push(room);
        placed = true;
        break;
      }
    }
  }

  return rooms;
}

function placeOpenings(rooms, rng) {
  const doors = [];
  const windows = [];

  for (const room of rooms) {
    const numDoors = rng.nextInt(0, 4);  // 0-3 doors
    const numWindows = rng.nextInt(0, 5);  // 0-4 windows
    const walls = [];

    // Perimeter walls: top, right, bottom, left
    walls.push({ side: "top", x1: room.x, y1: room.y, x2: room.x + room.width, y2: room.y });
    walls.push({ side: "right", x1: room.x + room.width, y1: room.y, x2: room.x + room.width, y2: room.y + room.height });
    walls.push({ side: "bottom", x1: room.x + room.width, y1: room.y + room.height, x2: room.x, y2: room.y + room.height });
    walls.push({ side: "left", x1: room.x, y1: room.y + room.height, x2: room.x, y2: room.y });

    for (let d = 0; d < numDoors && walls.length > 0; d++) {
      const wall = rng.choice(walls);
      const offset = rng.nextInt(10, (wall.side === "top" || wall.side === "bottom" ? room.width : room.height) - DOOR_WIDTH - 10);
      let x, y, width, height;

      if (wall.side === "top") {
        x = wall.x1 + offset;
        y = wall.y1;
        width = DOOR_WIDTH;
        height = 15;
      } else if (wall.side === "bottom") {
        x = wall.x1 - offset - DOOR_WIDTH;
        y = wall.y1 - 15;
        width = DOOR_WIDTH;
        height = 15;
      } else if (wall.side === "left") {
        x = wall.x1;
        y = wall.y1 - offset - DOOR_WIDTH;
        width = 15;
        height = DOOR_WIDTH;
      } else {  // right
        x = wall.x1 - 15;
        y = wall.y1 + offset;
        width = 15;
        height = DOOR_WIDTH;
      }

      doors.push({ x, y, width, height, roomId: room.id });
    }

    for (let w = 0; w < numWindows && walls.length > 0; w++) {
      const wall = rng.choice(walls);
      const offset = rng.nextInt(10, (wall.side === "top" || wall.side === "bottom" ? room.width : room.height) - WINDOW_WIDTH - 10);
      let x, y, width, height;

      if (wall.side === "top") {
        x = wall.x1 + offset;
        y = wall.y1;
        width = WINDOW_WIDTH;
        height = 12;
      } else if (wall.side === "bottom") {
        x = wall.x1 - offset - WINDOW_WIDTH;
        y = wall.y1 - 12;
        width = WINDOW_WIDTH;
        height = 12;
      } else if (wall.side === "left") {
        x = wall.x1;
        y = wall.y1 - offset - WINDOW_WIDTH;
        width = 12;
        height = WINDOW_WIDTH;
      } else {  // right
        x = wall.x1 - 12;
        y = wall.y1 + offset;
        width = 12;
        height = WINDOW_WIDTH;
      }

      windows.push({ x, y, width, height, roomId: room.id });
    }
  }

  return { doors, windows };
}

function generateSVG(rooms, doors, windows) {
  let svg = `<svg width="${SVG_WIDTH}" height="${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg" style="background:white;">`;

  // Draw room walls (perimeter)
  for (const room of rooms) {
    svg += `\n  <!-- Room ${room.id} walls -->`;
    svg += `\n  <line x1="${room.x}" y1="${room.y}" x2="${room.x + room.width}" y2="${room.y}" stroke="black" stroke-width="${WALL_STROKE_WIDTH}" />`;
    svg += `\n  <line x1="${room.x + room.width}" y1="${room.y}" x2="${room.x + room.width}" y2="${room.y + room.height}" stroke="black" stroke-width="${WALL_STROKE_WIDTH}" />`;
    svg += `\n  <line x1="${room.x + room.width}" y1="${room.y + room.height}" x2="${room.x}" y2="${room.y + room.height}" stroke="black" stroke-width="${WALL_STROKE_WIDTH}" />`;
    svg += `\n  <line x1="${room.x}" y1="${room.y + room.height}" x2="${room.x}" y2="${room.y}" stroke="black" stroke-width="${WALL_STROKE_WIDTH}" />`;
  }

  // Draw doors (simple arc/gap marker)
  for (const door of doors) {
    svg += `\n  <rect x="${door.x}" y="${door.y}" width="${door.width}" height="${door.height}" fill="none" stroke="gray" stroke-width="2" />`;
  }

  // Draw windows (double-line marker)
  for (const window of windows) {
    svg += `\n  <rect x="${window.x}" y="${window.y}" width="${window.width}" height="${window.height}" fill="white" stroke="blue" stroke-width="2" />`;
  }

  svg += `\n</svg>`;
  return svg;
}

function computeYOLOBoxes(rooms, doors, windows) {
  const boxes = [];

  // Wall boxes: bounding box per room
  for (const room of rooms) {
    const cx = (room.x + room.width / 2) / SVG_WIDTH;
    const cy = (room.y + room.height / 2) / SVG_HEIGHT;
    const w = room.width / SVG_WIDTH;
    const h = room.height / SVG_HEIGHT;
    boxes.push({ cls: CLASSES.wall, cx, cy, w, h });
  }

  // Door boxes
  for (const door of doors) {
    const cx = (door.x + door.width / 2) / SVG_WIDTH;
    const cy = (door.y + door.height / 2) / SVG_HEIGHT;
    const w = door.width / SVG_WIDTH;
    const h = door.height / SVG_HEIGHT;
    boxes.push({ cls: CLASSES.door, cx, cy, w, h });
  }

  // Window boxes
  for (const window of windows) {
    const cx = (window.x + window.width / 2) / SVG_WIDTH;
    const cy = (window.y + window.height / 2) / SVG_HEIGHT;
    const w = window.width / SVG_WIDTH;
    const h = window.height / SVG_HEIGHT;
    boxes.push({ cls: CLASSES.window, cx, cy, w, h });
  }

  return boxes;
}

function yoloLabel(boxes) {
  return boxes
    .map((b) => `${b.cls} ${b.cx.toFixed(6)} ${b.cy.toFixed(6)} ${b.w.toFixed(6)} ${b.h.toFixed(6)}`)
    .join("\n");
}

async function generateOne(index, outputDir, rng) {
  const rooms = generateRoomLayout(rng);
  const { doors, windows } = placeOpenings(rooms, rng);
  const svg = generateSVG(rooms, doors, windows);
  const boxes = computeYOLOBoxes(rooms, doors, windows);
  const label = yoloLabel(boxes);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: SVG_WIDTH, height: SVG_HEIGHT } });
  await page.setContent(svg);

  const imagePath = path.join(outputDir, "images", `synth_${String(index).padStart(5, "0")}.png`);
  await page.screenshot({ path: imagePath });
  await browser.close();

  const labelPath = path.join(outputDir, "labels", `synth_${String(index).padStart(5, "0")}.txt`);
  fs.writeFileSync(labelPath, label + "\n");

  console.log(`Generated synth_${String(index).padStart(5, "0")}`);
}

async function main() {
  const args = process.argv.slice(2);
  let count = 800;
  let seed = 42;
  let outputDir = path.join(__dirname, "output");

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--count" && i + 1 < args.length) count = parseInt(args[i + 1]);
    if (args[i] === "--seed" && i + 1 < args.length) seed = parseInt(args[i + 1]);
    if (args[i] === "--output-dir" && i + 1 < args.length) outputDir = args[i + 1];
  }

  const imagesDir = path.join(outputDir, "images");
  const labelsDir = path.join(outputDir, "labels");
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.mkdirSync(labelsDir, { recursive: true });

  console.log(`Generating ${count} synthetic floor plans...`);
  const rng = new SeededRandom(seed);

  for (let i = 0; i < count; i++) {
    await generateOne(i, outputDir, rng);
  }

  console.log(`Done. Output: ${outputDir}`);
}

main().catch(console.error);
