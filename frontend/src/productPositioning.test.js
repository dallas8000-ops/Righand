const fs = require('fs');
const path = require('path');

describe('RigHand product positioning', () => {
  const metadata = fs.readFileSync(path.resolve(process.cwd(), 'public/index.html'), 'utf8');
  const landingPage = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/LandingPage.jsx'),
    'utf8'
  );

  test('positions document metadata as fleet operations and transport compliance', () => {
    expect(metadata).toContain('RigHand AI | Fleet Operations &amp; Transport Compliance');
    expect(metadata).toMatch(/jurisdiction-aware/i);
    expect(metadata).not.toContain('Driver Profit Tracker');
  });

  test('leads the landing hero with fleet compliance while retaining offline trip proof', () => {
    expect(landingPage).toMatch(/fleet operations/i);
    expect(landingPage).toMatch(/jurisdiction-aware compliance/i);
    expect(landingPage).toMatch(/dispatch readiness/i);
    expect(landingPage).toMatch(/offline-first/i);
    expect(landingPage).toMatch(/GPS.*OBD-II/is);
  });

  test('plays the demo video from the marketing site, not from the app bundle', () => {
    expect(landingPage).toContain('https://gilliomfrontlinedigital.com/videos/righand-ai.mp4');
    expect(landingPage).toContain('https://gilliomfrontlinedigital.com/images/video-posters/righand-ai.jpg');
    expect(landingPage).toMatch(/preload="none"/);
    expect(fs.existsSync(path.resolve(process.cwd(), 'public/videos'))).toBe(false);
  });
});