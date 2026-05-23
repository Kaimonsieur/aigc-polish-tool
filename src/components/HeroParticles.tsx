"use client";

import { useEffect, useRef } from "react";

type Particle = {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  base: number;
  jitter: number;
  active: number;
};

export function HeroParticles() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const activeCanvas = canvas;
    const activeContext = context;
    const pointer = { x: -9999, y: -9999 };
    const smoothPointer = { x: -9999, y: -9999 };
    const lastPointer = { x: -9999, y: -9999 };
    let width = 0;
    let height = 0;
    let animation = 0;
    let particles: Particle[] = [];
    let idle = 1;
    let hasPointer = false;

    function clamp(value: number, min: number, max: number) {
      return Math.min(max, Math.max(min, value));
    }

    function resize() {
      const rect = activeCanvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      activeCanvas.width = Math.floor(width * ratio);
      activeCanvas.height = Math.floor(height * ratio);
      activeContext.setTransform(ratio, 0, 0, ratio, 0, 0);

      const spacing = 42;
      const cols = Math.ceil(width / spacing) + 2;
      const rows = Math.ceil(height / spacing) + 2;
      const offsetX = (width - (cols - 1) * spacing) / 2;
      const offsetY = (height - (rows - 1) * spacing) / 2;
      const centerX = width < 780 ? width * 0.5 : width * 0.29;
      const centerY = height * 0.45;
      const radiusX = width < 780 ? width * 0.48 : clamp(width * 0.2, 260, 390);
      const radiusY = clamp(height * 0.38, 210, 330);
      const nextParticles: Particle[] = [];

      for (let col = 0; col < cols; col += 1) {
        for (let row = 0; row < rows; row += 1) {
          const homeX = offsetX + col * spacing + (Math.random() - 0.5) * 5;
          const homeY = offsetY + row * spacing + (Math.random() - 0.5) * 5;
          const distance = Math.sqrt(
            ((homeX - centerX) / radiusX) ** 2 + ((homeY - centerY) / radiusY) ** 2,
          );
          const base = clamp(1 - distance, 0, 1);

          if (base > 0.015) {
            nextParticles.push({
              homeX,
              homeY,
              x: homeX,
              y: homeY,
              base: base ** 1.18,
              jitter: Math.random() * Math.PI * 2,
              active: 0,
            });
          }
        }
      }

      particles = nextParticles;
    }

    function draw() {
      activeContext.clearRect(0, 0, width, height);

      const speed = hasPointer ? Math.hypot(pointer.x - lastPointer.x, pointer.y - lastPointer.y) : 0;
      lastPointer.x = pointer.x;
      lastPointer.y = pointer.y;
      idle += ((speed < 0.5 ? 1 : 0) - idle) * 0.04;
      smoothPointer.x += (pointer.x - smoothPointer.x) * 0.1;
      smoothPointer.y += (pointer.y - smoothPointer.y) * 0.1;

      for (const particle of particles) {
        const dx = smoothPointer.x - particle.homeX;
        const dy = smoothPointer.y - particle.homeY;
        const distance = Math.hypot(dx, dy);
        const interaction = hasPointer && distance < 240 ? Math.sqrt(1 - distance / 240) : 0;
        particle.active += (interaction - particle.active) * 0.14;

        const repel = 1 + particle.active * 0.68;
        const driftX = Math.cos(Date.now() * 0.00045 + particle.jitter) * particle.base * 2.2;
        const driftY = Math.sin(Date.now() * 0.00038 + particle.jitter) * particle.base * 2.2;
        const targetX = hasPointer ? smoothPointer.x + (particle.homeX - smoothPointer.x) * repel : particle.homeX;
        const targetY = hasPointer ? smoothPointer.y + (particle.homeY - smoothPointer.y) * repel : particle.homeY;

        particle.x += (targetX + driftX - particle.x) * 0.18;
        particle.y += (targetY + driftY - particle.y) * 0.18;

        const green = particle.active;
        const red = Math.round(220 + (22 - 220) * green);
        const blue = Math.round(38 + (52 - 38) * green);
        const alpha = clamp(0.1 + particle.base * 0.82 + particle.active * (0.35 + idle * 0.08), 0, 0.95);
        const radius = 0.7 + particle.base * 2.25 + particle.active * 2.2;

        if (alpha > 0.04) {
          activeContext.beginPath();
          activeContext.fillStyle = `rgba(${red}, ${Math.round(38 + (101 - 38) * green)}, ${blue}, ${alpha})`;
          activeContext.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
          activeContext.fill();
        }
      }

      animation = requestAnimationFrame(draw);
    }

    function move(event: PointerEvent) {
      const rect = activeCanvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      if (!hasPointer) {
        smoothPointer.x = pointer.x;
        smoothPointer.y = pointer.y;
        lastPointer.x = pointer.x;
        lastPointer.y = pointer.y;
      }
      hasPointer = true;
    }

    function leave() {
      pointer.x = -9999;
      pointer.y = -9999;
      smoothPointer.x = -9999;
      smoothPointer.y = -9999;
      hasPointer = false;
    }

    resize();
    draw();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerleave", leave);

    return () => {
      cancelAnimationFrame(animation);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerleave", leave);
    };
  }, []);

  return <canvas ref={canvasRef} className="particle-canvas" aria-hidden="true" />;
}
