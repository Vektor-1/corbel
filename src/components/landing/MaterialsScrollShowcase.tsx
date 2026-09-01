'use client';

import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { animate } from 'animejs';
import { VoxelBlockInspector } from './VoxelBlockInspector';
import { WallThicknessWarning } from './WallThicknessWarning';
import { SpatialValidationVoxel } from './SpatialValidationVoxel';

gsap.registerPlugin(ScrollTrigger);

const INK = '#000f1d';
const GOLD = '#c9a96a';
const INACTIVE = '#c9c2b0';

const STEPS = [
  {
    n: '01',
    title: 'Voxel Block Inspector',
    tag: 'GS 1207:2018',
    desc: 'Hover coordinates to read block strength, density, and standards compliance.',
    C: VoxelBlockInspector,
  },
  {
    n: '02',
    title: 'Load-Bearing Wall Compliance',
    tag: 'GS 1207:2018 §5',
    desc: 'Toggle storey count and watch thin walls (150mm) get flagged under load.',
    C: WallThicknessWarning,
  },
  {
    n: '03',
    title: 'Volume & Boundary Enforcement',
    tag: 'GS 1207:2018 §4',
    desc: 'Close a perimeter and watch walls stack to define a compliant volume.',
    C: SpatialValidationVoxel,
  },
];

/**
 * Scroll-choreographed replacement for the horizontal filmstrip. GSAP
 * ScrollTrigger pins the left index while the three live (heerich-rendered)
 * sandbox panels scroll past on the right; anime.js drives the discrete
 * number/label state change each time a panel crosses the activation line.
 * Respects prefers-reduced-motion: no pin, no build-in stagger, everything
 * simply visible.
 */
export function MaterialsScrollShowcase() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const leftColRef = useRef<HTMLDivElement>(null);
  const numberRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const labelRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const panelRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const ctx = gsap.context(() => {
      const activate = (i: number) => {
        numberRefs.current.forEach((el, idx) => {
          if (!el) return;
          animate(el, {
            color: idx === i ? GOLD : INACTIVE,
            scale: idx === i ? 1.15 : 1,
            duration: prefersReducedMotion ? 1 : 320,
            ease: 'outQuad',
          });
        });
        labelRefs.current.forEach((el, idx) => {
          if (!el) return;
          el.style.opacity = idx === i ? '1' : '0.45';
          el.style.fontWeight = idx === i ? '700' : '600';
        });
      };

      if (!prefersReducedMotion && leftColRef.current && sectionRef.current) {
        ScrollTrigger.create({
          trigger: sectionRef.current,
          start: 'top top+=96',
          end: 'bottom bottom',
          pin: leftColRef.current,
          pinSpacing: false,
        });
      }

      panelRefs.current.forEach((panel, i) => {
        if (!panel) return;

        ScrollTrigger.create({
          trigger: panel,
          start: 'top 65%',
          end: 'bottom 35%',
          onEnter: () => activate(i),
          onEnterBack: () => activate(i),
        });

        const shapes = panel.querySelectorAll('svg polygon, svg path');
        if (!shapes.length) return;

        if (prefersReducedMotion) {
          gsap.set(shapes, { opacity: 1 });
          return;
        }

        gsap.set(shapes, { opacity: 0, scaleY: 0.6, transformOrigin: '50% 100%' });
        ScrollTrigger.create({
          trigger: panel,
          start: 'top 78%',
          once: true,
          onEnter: () => {
            gsap.to(shapes, { opacity: 1, scaleY: 1, duration: 0.6, stagger: 0.008, ease: 'power2.out' });
          },
        });
      });

      activate(0);
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section id="materials" ref={sectionRef} className="py-20 sm:py-24 px-4 sm:px-6 border-b-2" style={{ borderColor: INK }}>
      <div className="mx-auto max-w-6xl grid lg:grid-cols-12 gap-12 lg:gap-16">
        {/* Pinned index — stays put while the checks scroll past beside it */}
        <div ref={leftColRef} className="lg:col-span-4 lg:self-start">
          <h2
            className="font-[family-name:var(--font-brutal)] font-medium uppercase text-3xl sm:text-4xl mb-4"
            style={{ letterSpacing: '-0.02em', color: INK }}
          >
            Local Materials &amp; Standards
          </h2>
          <p className="text-sm leading-relaxed mb-10" style={{ color: '#4a5561' }}>
            Corbel anchors structural principles in physical construction standards.
            Scroll to inspect each check live.
          </p>

          <div className="flex flex-col gap-6">
            {STEPS.map((s, i) => (
              <div key={s.n} className="flex items-baseline gap-3">
                <span
                  ref={(el) => { numberRefs.current[i] = el; }}
                  className="font-[family-name:var(--font-brutal)] text-2xl font-medium"
                  style={{ color: i === 0 ? GOLD : INACTIVE }}
                >
                  {s.n}
                </span>
                <span
                  ref={(el) => { labelRefs.current[i] = el; }}
                  className="text-sm uppercase tracking-wide"
                  style={{ opacity: i === 0 ? 1 : 0.45, fontWeight: i === 0 ? 700 : 600, color: INK }}
                >
                  {s.title}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Scrolling checks */}
        <div className="lg:col-span-8 flex flex-col gap-16">
          {STEPS.map((s, i) => (
            <div key={s.n} ref={(el) => { panelRefs.current[i] = el; }}>
              <div className="flex items-center justify-between mb-4">
                <span
                  className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 border-2"
                  style={{ borderColor: INK, color: INK }}
                >
                  {s.tag}
                </span>
              </div>
              <p className="text-xs mb-5" style={{ color: '#4a5561' }}>{s.desc}</p>
              <div className="border-2 p-1" style={{ borderColor: INK, backgroundColor: '#12110e' }}>
                <s.C />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
