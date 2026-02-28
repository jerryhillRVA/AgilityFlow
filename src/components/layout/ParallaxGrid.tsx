'use client';

import { useEffect, useRef } from 'react';

export function ParallaxGrid() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Find the grid child (first child div)
    const grid = container.querySelector('.parallax-grid') as HTMLElement;
    if (!grid) return;

    function onScroll() {
      const main = document.querySelector('main');
      if (main && grid) {
        const scrollY = main.scrollTop;
        grid.style.setProperty('--scroll-y', String(scrollY));
        // Parallax: shift background position based on scroll
        grid.style.backgroundPosition = `center calc(${scrollY} * -0.15px)`;
      }
    }

    // Try to attach to main immediately, or watch for it
    const attach = () => {
      const main = document.querySelector('main');
      if (main) {
        main.addEventListener('scroll', onScroll, { passive: true });
        return true;
      }
      return false;
    };

    if (!attach()) {
      const observer = new MutationObserver(() => {
        if (attach()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      return () => observer.disconnect();
    }

    return () => {
      const main = document.querySelector('main');
      if (main) main.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <>
      <div ref={containerRef} className="parallax-grid-container">
        <div className="parallax-grid" />
      </div>
      <div className="grid-horizon" />
      <div className="ambient-glow" />
    </>
  );
}
