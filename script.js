(() => {
  "use strict";

  const art = document.querySelector("#planet-art");
  if (!art) return;


  const profile = {
    seed: 4280002121,
    palette: " .:-=+*#%@",
    accentChar: ".",
    accentThreshold: 0.9,
    verticalScale: 1.9,
    radiusScale: 0.9522090215835829,
    lightDirection: [-0.6551977673392446, 0.16839263658168402],
    bandFrequency: 0.07,
    bandStrength: 0,
    noiseTerms: [
      [0.3035518839903832, 0.3115280626415991, 0.7032090913060245, 6.153232557631788],
      [0.30491123398239733, 1.0711781085763001, 0.9372005304805823, 4.086368604987639],
      [0.2786882491690712, 1.0025447025445378, 0.887336200618321, 5.195364568592314],
    ],
  };

  const animationStart = performance.now();
  let lastDraw = 0;
  const showPlanet = false;


  function cellNoise(x, y, seed) {
    let value = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ seed) >>> 0;
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d) >>> 0;
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b) >>> 0;
    value ^= value >>> 16;
    value >>>= 0;
    return value / 4294967295;
  }


  function surfaceNoise(x, y) {
    let value = 0;
    for (const [amplitude, fx, fy, phase] of profile.noiseTerms) {
      value += amplitude * Math.sin((fx * x) + (fy * y) + phase);
    }
    return value / profile.noiseTerms.length;
  }


  function starfieldChar(x, y, sampleTime) {
    const baseNoise = cellNoise(x, y, profile.seed ^ 0x5a77c35e);
    if (baseNoise > 0.054) return " ";

    const sparkleNoise = cellNoise(x, y, profile.seed ^ 0x1f123bb5);
    const phaseNoise = cellNoise(x, y, profile.seed ^ 0x44a38e2d);
    const rateNoise = cellNoise(x, y, profile.seed ^ 0x6c8e9cf5);
    const rate = 0.12 + (rateNoise * 0.10);
    const phase = Math.floor((phaseNoise * 9) + (sampleTime * rate)) % 9;

    if (baseNoise < 0.012) return phase <= 1 ? "*" : ".";
    if (baseNoise < 0.025) return ((phase + Math.floor(sparkleNoise * 2)) % 9) <= 1 ? "*" : ".";
    return sparkleNoise < 0.18 && phase === 0 ? "*" : ".";
  }


  function planetChar(x, y, centerX, centerY, radius) {
    const dx = x - centerX;
    const dy = (y - centerY) * profile.verticalScale;
    const distance = Math.sqrt((dx * dx) + (dy * dy));
    if (distance > radius) return null;

    const centerStrength = 1 - (distance / radius);
    let light = (
      0.52
      + (centerStrength * 0.36)
      - (dx * 0.018 * profile.lightDirection[0])
      - (dy * 0.015 * profile.lightDirection[1])
    );
    light += surfaceNoise(x * 0.28, y * 0.22);
    if (profile.bandStrength > 0) {
      light += Math.sin(
        (y * profile.bandFrequency * 0.7) + (x * profile.bandFrequency * 0.18),
      ) * profile.bandStrength * 0.8;
    }
    const rim = Math.max(0, (distance - (radius * 0.7)) / (radius * 0.3));
    light -= rim * 0.28;

    const shade = Math.max(0, Math.min(0.999, light));
    let token = profile.palette[Math.floor(shade * (profile.palette.length - 1))];
    const accentNoise = cellNoise(x, y, profile.seed ^ 0x41c64e6d);
    if (centerStrength > 0.14 && accentNoise > profile.accentThreshold) {
      token = profile.accentChar;
    }
    return token;
  }

  function dimensions() {
    const fontSize = parseFloat(getComputedStyle(art).fontSize);
    return {
      width: Math.max(32, Math.floor(art.clientWidth / (fontSize * 0.6))),
      height: Math.max(20, Math.floor(window.innerHeight / (fontSize * 1.02))),
    };
  }


  function contentSafeZones() {
    return [".logo", ".coming-soon", "nav", ".video-frame"].flatMap((selector) => (
      [...document.querySelectorAll(selector)].map((element) => {
        const rect = element.getBoundingClientRect();
        const paddingX = selector === ".logo" ? 18 : 12;
        const paddingY = selector === ".logo" ? 10 : 8;
        return {
          left: rect.left - paddingX,
          right: rect.right + paddingX,
          top: rect.top - paddingY,
          bottom: rect.bottom + paddingY,
        };
      })
    ));
  }


  function inContentSafeZone(x, y, cellWidth, lineHeight, zones) {
    const left = x * cellWidth;
    const right = left + cellWidth;
    const top = y * lineHeight;
    const bottom = top + lineHeight;
    return zones.some((zone) => (
      left < zone.right
      && right > zone.left
      && top < zone.bottom
      && bottom > zone.top
    ));
  }

  function planetMetrics(width, height, planetTop) {
    const planetHeight = Math.max(20, height - planetTop);
    const radius = Math.min(
      width * 0.48,
      planetHeight * profile.verticalScale * 0.86,
    ) * Math.max(0.92, profile.radiusScale);
    const centerY = planetHeight - (planetHeight * 0.05) + 1 + (planetHeight * 0.2);
    return { planetHeight, radius, centerY };
  }

  // Keep the planet prominent while leaving the intro readable.
  function planetTopRow(width, height, lineHeight) {
    const baselineTop = Math.floor(height * 0.34);
    const introGrid = document.querySelector(".intro-grid");
    if (!introGrid) return baselineTop;

    const contentBottom = Math.ceil(
      (introGrid.getBoundingClientRect().bottom + (lineHeight * 2)) / lineHeight,
    );
    let planetTop = baselineTop;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { radius, centerY } = planetMetrics(width, height, planetTop);
      const visibleTop = planetTop + centerY - (radius / profile.verticalScale);
      if (visibleTop >= contentBottom) break;
      planetTop += Math.ceil(contentBottom - visibleTop);
    }
    return planetTop;
  }


  function render(sampleTime = (performance.now() - animationStart) / 1000) {
    const { width, height } = dimensions();
    const fontSize = parseFloat(getComputedStyle(art).fontSize);
    const cellWidth = fontSize * 0.6;
    const lineHeight = fontSize * 1.02;
    const safeZones = contentSafeZones();
    const planetTop = planetTopRow(width, height, lineHeight);
    const { planetHeight, radius, centerY } = planetMetrics(width, height, planetTop);
    const centerX = (width - 1) / 2;
    const lines = [];

    for (let y = 0; y < height; y += 1) {
      const sceneY = y - planetTop;
      let line = "";
      for (let x = 0; x < width; x += 1) {
        const planet = showPlanet && y >= planetTop
          ? planetChar(x, sceneY, centerX, centerY, radius)
          : null;
        const star = inContentSafeZone(x, y, cellWidth, lineHeight, safeZones)
          ? " "
          : starfieldChar(x, y, sampleTime);
        line += planet ?? star;
      }
      lines.push(line.trimEnd());
    }

    art.textContent = lines.join("\n");
  }


  function tick(timestamp) {
    if (timestamp - lastDraw > 100) {
      render((timestamp - animationStart) / 1000);
      lastDraw = timestamp;
    }
    window.requestAnimationFrame(tick);
  }

  window.addEventListener("resize", render);
  render();
  window.requestAnimationFrame(tick);


  const lightbox = document.querySelector("#lightbox");
  const lightboxImage = document.querySelector("#lightbox-image");
  const closeButton = document.querySelector(".lightbox-close");
  if (!lightbox || !lightboxImage || !closeButton) return;
  document.querySelectorAll(".image-slot").forEach((image) => {
    image.addEventListener("click", () => {
      lightboxImage.src = image.src;
      lightboxImage.alt = image.alt;
      lightbox.showModal();
    });
  });
  closeButton.addEventListener("click", () => lightbox.close());
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) lightbox.close();
  });
})();
