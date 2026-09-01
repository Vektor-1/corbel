"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Heerich } from 'heerich';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function SpatialValidationVoxel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isValidated, setIsValidated] = useState(false);

  // Generate Voxel Scene
  const h = new Heerich({
    camera: { type: 'oblique', angle: -45, distance: 10 }
  });

  // Styles
  const wallStyle = { default: { fill: '#8d8676', stroke: '#4d4839', strokeWidth: 1 } };
  const slabStyle = { default: { fill: '#1f1d17', stroke: '#2c2921', strokeWidth: 1 } };
  const markerStyle = { default: { fill: 'rgba(34, 197, 94, 0.2)', stroke: '#22c55e', strokeWidth: 1.5 } };

  // Foundation Slab
  h.addBox({ position: [-1, 1, -1], size: [7, 1, 7], style: slabStyle });

  // Walls
  h.addBox({ position: [0, 0, 0], size: [5, 1, 1], style: wallStyle });
  h.addBox({ position: [0, 0, 4], size: [5, 1, 1], style: wallStyle });
  h.addBox({ position: [0, 0, 1], size: [1, 1, 3], style: wallStyle });
  h.addBox({ position: [4, 0, 1], size: [1, 1, 3], style: wallStyle });

  // Green compliance validation volume when active
  if (isValidated) {
    h.addBox({ position: [1, 0, 1], size: [3, 1, 3], style: markerStyle });
  }

  const svgMarkup = h.toSVG({ padding: 15 });

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const polygons = canvasRef.current.querySelectorAll('polygon');
    
    // Animate voxels stacking on scroll
    gsap.fromTo(polygons,
      { opacity: 0, scaleY: 0, y: -40, transformOrigin: '50% 100%' },
      {
        opacity: 1,
        scaleY: 1,
        y: 0,
        duration: 0.6,
        stagger: 0.015,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: containerRef.current,
          start: 'top 80%',
          onEnter: () => {
            // Trigger compliance highlight after blocks stack
            setTimeout(() => setIsValidated(true), 800);
          },
          onLeaveBack: () => {
            setIsValidated(false);
          }
        }
      }
    );
  }, []);

  return (
    <div 
      ref={containerRef}
      className="flex flex-col lg:flex-row gap-8 py-6 text-sm overflow-hidden border-b border-[#2c2921]"
    >
      <div className="flex-1 flex flex-col justify-center">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-4 w-fit uppercase tracking-widest font-mono">
          GS 1207:2018 // Section 4.1
        </div>
        <h3 className="text-xl font-bold text-[#ece7da] mb-3">Spatial Area Compliance</h3>
        <p className="text-[#c4bda9] mb-4 leading-relaxed">
          Corbel computes enclosed loops dynamically. When you close a room boundary, the system lifts it and verifies the minimum usable floor space.
        </p>
        <div className="flex items-center gap-3 text-xs text-[#a39a89] bg-[#12110e]/40 p-3 rounded-lg border border-[#2c2921]">
          <span className={`h-2.5 w-2.5 rounded-full ${isValidated ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          <span>{isValidated ? 'Classroom zone complies: 12.0m² >= 9.0m² minimum' : 'Evaluating room perimeter...'}</span>
        </div>
      </div>
      <div 
        ref={canvasRef}
        dangerouslySetInnerHTML={{ __html: svgMarkup }} 
        className="w-full lg:w-[320px] aspect-[4/3] bg-[#12110e]/20 rounded-lg flex items-center justify-center border border-[#2c2921] select-none"
      />
    </div>
  );
}
