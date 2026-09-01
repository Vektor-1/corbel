"use client";

import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface ScrollRevealProps {
  children: React.ReactNode;
  delay?: number;
  yOffset?: number;
}

export function ScrollReveal({ children, delay = 0, yOffset = 30 }: ScrollRevealProps) {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!elementRef.current) return;

    const mm = gsap.matchMedia();

    mm.add(
      {
        reduced: '(prefers-reduced-motion: reduce)',
        full: '(prefers-reduced-motion: no-preference)',
      },
      (context) => {
        const { reduced } = context.conditions as { reduced: boolean };

        gsap.fromTo(
          elementRef.current,
          { opacity: 0, y: reduced ? 0 : yOffset },
          {
            opacity: 1,
            y: 0,
            duration: reduced ? 0.3 : 0.8,
            delay,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: elementRef.current,
              start: 'top 85%',
              toggleActions: 'play none none none',
            },
          }
        );
      }
    );

    return () => mm.revert();
  }, [delay, yOffset]);

  return <div ref={elementRef}>{children}</div>;
}
