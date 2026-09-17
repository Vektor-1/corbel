'use client';

import { useEffect, useRef, useState } from 'react';

export function TaglineReveal({ lines }: { lines: string[] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const words = lines.flatMap((line, lineIndex) => [
    ...line.split(' ').map((word) => ({ word, lineIndex })),
    ...(lineIndex < lines.length - 1 ? [{ word: '', lineIndex }] : []),
  ]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="border-b-2 px-4 py-20 sm:px-6 sm:py-24" style={{ borderColor: '#000f1d' }}>
      <div className="mx-auto max-w-4xl">
        <p className="mb-5 text-sm font-semibold" style={{ color: '#8a6b3f' }}>A visual way to learn</p>
        <h2 className="text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl" style={{ color: '#000f1d' }}>
          {words.map(({ word, lineIndex }, index) =>
            word ? (
              <span
                key={`${word}-${index}`}
                className="mr-[0.26em] inline-block transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
                style={{
                  color: isVisible ? '#000f1d' : '#000f1d66',
                  transitionDelay: `${index * 38}ms`,
                  transform: isVisible ? 'translateY(0)' : 'translateY(0.22em)',
                }}
              >
                {word}
              </span>
            ) : (
              <br key={`break-${lineIndex}`} />
            )
          )}
        </h2>
      </div>
    </section>
  );
}
