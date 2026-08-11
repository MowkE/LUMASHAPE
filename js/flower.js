/**
 * flower.js — the payoff demo: the same flower through two kinds of eyes.
 *
 * Many flowers wear ultraviolet nectar guides — a bullseye painted in a
 * channel we can't see, aimed at pollinators who can. This is a procedural
 * illustration of that pattern (not a photograph): human view on the left,
 * bird/bee false-color view on the right.
 */

export function drawFlowers(canvas, birdVision) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);

  const flower = (cx, cy, r, uv) => {
    // petals
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.save();
      g.translate(cx, cy);
      g.rotate(a);
      const grad = g.createLinearGradient(0, -r * 0.28, 0, -r);
      if (uv) {
        // the UV bullseye: petal bases scream in false color
        grad.addColorStop(0, '#8a6cff');
        grad.addColorStop(0.45, '#5fd8c8');
        grad.addColorStop(1, '#e8d64a');
      } else {
        grad.addColorStop(0, '#e8d64a');
        grad.addColorStop(1, '#f2e37a');
      }
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(0, -r * 0.62, r * 0.20, r * 0.42, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    // center
    const c = g.createRadialGradient(cx, cy, 2, cx, cy, r * 0.30);
    if (uv) {
      c.addColorStop(0, '#f4f0ff');
      c.addColorStop(0.6, '#8a6cff');
      c.addColorStop(1, '#4c3fae');
    } else {
      c.addColorStop(0, '#a8842c');
      c.addColorStop(1, '#7c5f1d');
    }
    g.fillStyle = c;
    g.beginPath();
    g.arc(cx, cy, r * 0.30, 0, Math.PI * 2);
    g.fill();
  };

  flower(W * 0.27, H * 0.52, H * 0.40, false);
  flower(W * 0.73, H * 0.52, H * 0.40, birdVision);

  g.font = '600 11px "Instrument Sans", sans-serif';
  g.textAlign = 'center';
  g.fillStyle = 'rgba(233,228,214,0.75)';
  g.fillText('YOU', W * 0.27, H * 0.97);
  g.fillText(birdVision ? 'THE BIRD' : 'THE BIRD (press B)', W * 0.73, H * 0.97);
}
