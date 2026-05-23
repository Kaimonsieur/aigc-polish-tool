"use client";

import { useEffect, useState } from "react";

const words = ["无损保留文章原意", "降低机器感", "重组句式结构", "提升表达自然度"];

export function TypewriterTitle() {
  const [wordIndex, setWordIndex] = useState(0);
  const [length, setLength] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = words[wordIndex];
    const doneTyping = !deleting && length === word.length;
    const doneDeleting = deleting && length === 0;

    const delay = doneTyping ? 1200 : deleting ? 80 : 130;
    const timer = window.setTimeout(() => {
      if (doneTyping) {
        setDeleting(true);
        return;
      }
      if (doneDeleting) {
        setDeleting(false);
        setWordIndex((current) => (current + 1) % words.length);
        return;
      }
      setLength((current) => current + (deleting ? -1 : 1));
    }, delay);

    return () => window.clearTimeout(timer);
  }, [deleting, length, wordIndex]);

  const visible = words[wordIndex].slice(0, length) || words[wordIndex].slice(0, 1);

  return (
    <h1 className="hero-title">
      论文降 AIGC
      <br />
      <span className="typewriter-wrap">
        <span className="hero-highlight">{visible}</span>
        <span className="cursor">|</span>
      </span>
    </h1>
  );
}
