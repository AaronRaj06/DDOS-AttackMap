export function seeded(seed = 7) {
  let state = seed;
  return () => ((state = (state * 16807) % 2147483647) / 2147483647);
}

// Synthetic data, only to prove the learner works. Says nothing about real-world accuracy.
export function dataset({ signal = true, size = 2000 } = {}) {
  const random = seeded();
  return Array.from({ length: size }, (_, i) => {
    const hosting = random() < 0.3;
    return {
      ip: `${20 + (i % 150)}.${i >> 8}.${i & 255}.9`,
      country: ['US', 'DE', 'BR'][Math.floor(random() * 3)],
      asn: 100 + Math.floor(random() * 10),
      org: hosting ? 'Example Hosting' : 'Example Net',
      ageHours: random() * 24,
      ddos: random() < (!signal ? 0.25 : hosting ? 0.85 : 0.06),
    };
  });
}
