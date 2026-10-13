// Variables globales
let isPlaying = false;          // la música está sonando
let musicStarted = false;       // la música ya arrancó
let musicUnlocked = false;      // (se mantiene por compatibilidad)
let currentSlide = 0;
let totalSlides = 0;
let carouselTimer = null;

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    initializeCountdown();
    initializeCarousel();
    initializeIntro();
    initializeMusicControls();
    initializeGuestGreeting();
    initializeScrollReveal(); // después del saludo: la sección de invitados puede aparecer
});

// =========================================================
// Intro: sobre animado
// - Se toca para abrir: en ese mismo toque arranca la música de fondo
//   (el toque es lo que permite sonido en iPhone/Android)
// - El video del sobre va sin sonido
// - Al terminar el video entra directo a la invitación con una transición
// =========================================================
function initializeIntro() {
    const intro = document.getElementById('intro');
    const video = document.getElementById('introVideo');
    if (!intro || !video) return;

    let started = false;
    let finished = false;

    const start = () => {
        if (started) return;
        started = true;
        intro.classList.add('is-playing');
        intro.setAttribute('aria-label', 'Abriendo la invitación');

        // La música empieza desde el inicio, dentro del toque
        startMusic();

        video.muted = true;
        const p = video.play();
        if (p && p.catch) {
            // Si el video no se puede reproducir, se entra directo a la invitación
            p.catch(() => finish());
        }
    };

    const finish = () => {
        if (finished) return;
        finished = true;
        startMusic(); // por si acaso no había arrancado
        revealInvitation();
    };

    intro.addEventListener('click', start);
    intro.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); }
    });

    video.addEventListener('ended', finish);
    video.addEventListener('error', () => { if (started) finish(); });

    // Seguro: si el video se queda trabado, entrar igual
    video.addEventListener('playing', () => {
        const ms = ((video.duration || 8) - video.currentTime + 2.5) * 1000;
        clearTimeout(video._safety);
        video._safety = setTimeout(finish, ms);
    });
}

// Transición elegante: el destello final del video se convierte en un velo de
// luz suave con destellos azul cielo, y la portada "se revela" desde la luz.
function revealInvitation() {
    const body = document.body;
    window.scrollTo(0, 0);
    body.classList.remove('intro-active');
    // forzar reflow para que la animación arranque limpia
    void body.offsetWidth;
    body.classList.add('is-revealing');
    playSparkles(3200);

    const musicPlayer = document.getElementById('musicPlayer');
    setTimeout(() => {
        musicPlayer.style.display = 'block';
        musicPlayer.classList.add('is-visible');
    }, 2400);

    setTimeout(() => {
        body.classList.add('intro-done');
        const video = document.getElementById('introVideo');
        if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    }, 3600);
}

// Destellos azul cielo que flotan durante la transición (canvas liviano)
function playSparkles(duration) {
    const canvas = document.getElementById('introSparkles');
    if (!canvas || !canvas.getContext) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const count = Math.round(Math.min(70, Math.max(35, (w * h) / 12000)));
    const parts = Array.from({ length: count }, () => {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.25 + Math.random() * 1.1;
        return {
            x: w / 2 + (Math.random() - 0.5) * w * 0.35,
            y: h * 0.46 + (Math.random() - 0.5) * h * 0.25,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.5,
            r: 0.8 + Math.random() * 2.2,
            delay: Math.random() * 600,
            life: 1400 + Math.random() * 1600,
            hue: 208 + Math.random() * 14
        };
    });

    const t0 = performance.now();
    const frame = (now) => {
        const t = now - t0;
        ctx.clearRect(0, 0, w, h);
        parts.forEach(p => {
            const age = t - p.delay;
            if (age < 0 || age > p.life) return;
            const k = age / p.life;
            const alpha = Math.sin(Math.PI * k) * 0.9;
            const x = p.x + p.vx * age * 0.06;
            const y = p.y + p.vy * age * 0.06;
            const glow = ctx.createRadialGradient(x, y, 0, x, y, p.r * 4);
            glow.addColorStop(0, `hsla(${p.hue}, 80%, 85%, ${alpha})`);
            glow.addColorStop(0.4, `hsla(${p.hue}, 70%, 60%, ${alpha * 0.45})`);
            glow.addColorStop(1, `hsla(${p.hue}, 70%, 55%, 0)`);
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, y, p.r * 4, 0, Math.PI * 2);
            ctx.fill();
        });
        if (t < duration) requestAnimationFrame(frame);
        else ctx.clearRect(0, 0, w, h);
    };
    requestAnimationFrame(frame);
}

// =========================================================
// Música (archivo propio, ya no YouTube)
// =========================================================
function getMusic() { return document.getElementById('bgMusic'); }

// Se llama dentro del toque: deja el audio "autorizado" para que luego,
// en el segundo 5, pueda sonar sin otro toque (iOS lo exige).
function unlockMusic() {
    const music = getMusic();
    if (!music || musicUnlocked) return;
    musicUnlocked = true;
    music.muted = true;
    const p = music.play();
    if (p && p.then) {
        p.then(() => { if (!musicStarted) { music.pause(); music.currentTime = 0; } })
         .catch(() => {});
    }
}

function startMusic() {
    const music = getMusic();
    if (!music || musicStarted) return;
    musicStarted = true;
    music.muted = false;

    // Primero el play, directo dentro del toque (lo que exige iPhone/Safari).
    // Volver al segundo 0 solo si ya había avanzado (p. ej. tras el
    // desbloqueo en silencio); hacerlo antes de cargar podía fallar en Safari.
    try { if (music.currentTime > 0.05) music.currentTime = 0; } catch (e) {}
    let p = null;
    try { p = music.play(); } catch (e) { p = Promise.reject(e); }
    fadeInVolume(music, 1500);
    isPlaying = true;
    updateMusicIcon();

    if (p && p.catch) {
        p.catch(() => {
            // El navegador no la dejó sonar: se reintenta con el próximo toque
            // en cualquier parte y se muestra el botón de música.
            musicStarted = false;
            isPlaying = false;
            updateMusicIcon();
            retryMusicOnNextTouch();
        });
    }

    // Seguro extra: si a los 2 s sigue en pausa, mostrar el botón para activarla
    setTimeout(() => {
        if (music.paused && !userPausedMusic) {
            isPlaying = false;
            updateMusicIcon();
            showMusicButton(true);
        }
    }, 2000);
}

let userPausedMusic = false;
let retryArmed = false;

function retryMusicOnNextTouch() {
    showMusicButton(true);
    if (retryArmed) return;
    retryArmed = true;
    const handler = (e) => {
        // Si tocan el botón de música, ese botón ya se encarga
        if (e.target && e.target.closest && e.target.closest('#musicToggle')) return;
        document.removeEventListener('touchend', handler, true);
        document.removeEventListener('click', handler, true);
        retryArmed = false;
        startMusic();
    };
    document.addEventListener('touchend', handler, true);
    document.addEventListener('click', handler, true);
}

function showMusicButton(attention) {
    const mp = document.getElementById('musicPlayer');
    if (!mp) return;
    mp.style.display = 'block';
    mp.classList.add('is-visible');
    mp.classList.toggle('needs-tap', !!attention);
}

// Subida de volumen suave (en iPhone el volumen lo maneja el sistema y se ignora).
// Con temporizador + seguro final: el volumen SIEMPRE termina en 1.
function fadeInVolume(el, ms) {
    try {
        el.volume = 0.05;
        const t0 = Date.now();
        const timer = setInterval(() => {
            const k = Math.min(1, (Date.now() - t0) / ms);
            try { el.volume = Math.max(0.05, k); } catch (e) {}
            if (k >= 1) clearInterval(timer);
        }, 50);
        setTimeout(() => { clearInterval(timer); try { el.volume = 1; } catch (e) {} }, ms + 300);
    } catch (e) { /* sin control de volumen */ }
}

function initializeMusicControls() {
    const music = getMusic();
    const toggle = document.getElementById('musicToggle');
    if (!music || !toggle) return;

    toggle.addEventListener('click', toggleMusic);
    music.addEventListener('play', () => { if (!music.muted) { isPlaying = true; updateMusicIcon(); } });
    music.addEventListener('pause', () => { isPlaying = false; updateMusicIcon(); });

    // Pausar si el invitado sale de la página y retomar al volver
    let resumeOnReturn = false;
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            resumeOnReturn = isPlaying;
            if (isPlaying) music.pause();
        } else if (resumeOnReturn) {
            music.play().catch(() => {});
        }
    });
}

function toggleMusic() {
    const music = getMusic();
    if (!music) return;
    if (isPlaying) {
        userPausedMusic = true;
        music.pause();
    } else {
        userPausedMusic = false;
        musicStarted = true;
        music.muted = false;
        try { music.volume = 1; } catch (e) {}
        music.play().catch(() => {});
    }
    showMusicButton(false);
}

function updateMusicIcon() {
    const volumeIcon = document.getElementById('volumeIcon');

    if (volumeIcon) {
        if (isPlaying) {
            volumeIcon.innerHTML = `
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="#1F3A68" stroke="#fff" stroke-width="1"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.08" stroke="#1F3A68" stroke-width="2"></path>
                <circle cx="6.5" cy="12" r="1" fill="#6F93C6"/>
            `;
        } else {
            volumeIcon.innerHTML = `
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="#1F3A68" stroke="#fff" stroke-width="1"></polygon>
                <line x1="19" y1="9" x2="17" y2="11" stroke="#3F67A3" stroke-width="2"></line>
                <line x1="17" y1="9" x2="19" y2="11" stroke="#3F67A3" stroke-width="2"></line>
                <circle cx="6.5" cy="12" r="1" fill="#3F67A3"/>
            `;
        }
    }
}

// Countdown
function initializeCountdown() {
    const targetDate = new Date('2027-04-24T16:00:00-04:00').getTime(); // hora de República Dominicana
    
    function updateCountdown() {
        const now = new Date().getTime();
        const difference = targetDate - now;
        
        if (difference > 0) {
            const days = Math.floor(difference / (1000 * 60 * 60 * 24));
            const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((difference % (1000 * 60)) / 1000);
            
            document.getElementById('days').textContent = days.toString().padStart(2, '0');
            document.getElementById('hours').textContent = hours.toString().padStart(2, '0');
            document.getElementById('minutes').textContent = minutes.toString().padStart(2, '0');
            document.getElementById('seconds').textContent = seconds.toString().padStart(2, '0');
        } else {
            document.getElementById('days').textContent = '00';
            document.getElementById('hours').textContent = '00';
            document.getElementById('minutes').textContent = '00';
            document.getElementById('seconds').textContent = '00';
        }
    }
    
    updateCountdown();
    setInterval(updateCountdown, 1000);
}

// Carrusel
function initializeCarousel() {
    const track = document.getElementById('carouselTrack');
    const nextBtn = document.getElementById('nextBtn');
    const prevBtn = document.getElementById('prevBtn');

    if (!track) return;

    // calcular total dinámicamente
    const items = track.querySelectorAll('.carousel-item');
    totalSlides = items.length;
    const totalSlidesElement = document.getElementById('totalSlides');
    if (totalSlidesElement) totalSlidesElement.textContent = totalSlides;

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentSlide = (currentSlide + 1) % totalSlides;
            updateCarousel();
            startCarouselAutoplay();
        });
    }
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
            updateCarousel();
            startCarouselAutoplay();
        });
    }

    // Ajuste inicial para asegurar cálculo correcto tras el render
    updateCarousel();
    requestAnimationFrame(updateCarousel);
    setTimeout(updateCarousel, 200);

    // Deslizar con el dedo en el celular
    const trackContainer = track.parentElement;
    let touchX = null;
    trackContainer.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
    trackContainer.addEventListener('touchend', (e) => {
        if (touchX === null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        touchX = null;
        if (Math.abs(dx) < 40) return;
        (dx < 0 ? nextBtn : prevBtn).click();
    });

    startCarouselAutoplay();
}

// Auto-play del carrusel (se reinicia cuando el invitado cambia de foto,
// para que no salte justo después de tocar una flecha)
function startCarouselAutoplay() {
    clearInterval(carouselTimer);
    carouselTimer = setInterval(nextSlide, 2000); // 2 segundos por foto
}

function updateCarousel() {
    const track = document.getElementById('carouselTrack');
    if (track) {
        const items = track.querySelectorAll('.carousel-item');
        if (!items.length) return;
        const container = track.parentElement;

        // Temporarily reset transform to measure actual positions
        const previousTransform = track.style.transform;
        track.style.transform = 'none';

        const firstRect = items[0].getBoundingClientRect();
        const secondRect = items[1] ? items[1].getBoundingClientRect() : null;
        const stepWidth = Math.max(1, secondRect ? Math.round(secondRect.left - firstRect.left) : Math.round(firstRect.width));

        const containerWidth = Math.round(container.getBoundingClientRect().width);
        const visibleCount = Math.max(1, Math.floor((containerWidth + 1) / stepWidth));
        const maxIndex = Math.max(0, totalSlides - visibleCount);

        // Detecta si hay que dar la vuelta (de la última foto a la 1, o viceversa)
        let wrapped = false;
        if (currentSlide > maxIndex) { currentSlide = 0; wrapped = true; }
        if (currentSlide < 0) { currentSlide = maxIndex; wrapped = true; }

        const trackRect = track.getBoundingClientRect();
        const baseLeft = Math.round(firstRect.left - trackRect.left);
        const translateXpx = -Math.round(baseLeft + (currentSlide * stepWidth));

        if (wrapped) {
            // Al dar la vuelta, salta directo a la foto 1 sin animar el regreso
            // (evita el efecto de "devolverse" deslizando hacia atrás por todas las fotos)
            const prevTransition = track.style.transition;
            track.style.transition = 'none';
            track.style.transform = `translateX(${translateXpx}px)`;
            void track.offsetWidth; // fuerza reflow para aplicar el salto sin animación
            track.style.transition = prevTransition || '';
        } else {
            // Apply transform
            track.style.transform = `translateX(${translateXpx}px)`;
        }
        // console.log('Carousel moved to slide:', { currentSlide, visibleCount, maxIndex, translateXpx, stepWidth, baseLeft });
    }
    updateSlideCounter();
    markCenterCarouselItem();
}

function nextSlide() {
    currentSlide++;
    updateCarousel();
}

function previousSlide() {
    currentSlide--;
    updateCarousel();
}

function updateSlideCounter() {
    const currentSlideElement = document.getElementById('currentSlide');
    const totalSlidesElement = document.getElementById('totalSlides');
    if (currentSlideElement) currentSlideElement.textContent = (currentSlide + 1);
    if (totalSlidesElement) totalSlidesElement.textContent = totalSlides;
}

// Mark center carousel item on desktop
function markCenterCarouselItem() {
    const track = document.getElementById('carouselTrack');
    if (!track) return;
    const items = Array.from(track.querySelectorAll('.carousel-item'));
    if (!items.length) return;
    items.forEach(it => it.classList.remove('is-center'));

    const firstItem = items[0];
    const container = track.parentElement;
    const itemWidth = firstItem.getBoundingClientRect().width;
    const containerWidth = container.getBoundingClientRect().width;
    const visibleCount = Math.max(1, Math.floor(containerWidth / itemWidth));

    const centerIndex = (currentSlide + Math.floor(visibleCount / 2)) % items.length;
    items[centerIndex].classList.add('is-center');
}

// Hook into carousel updates
const _origUpdateCarousel = typeof updateCarousel === 'function' ? updateCarousel : null;
if (_origUpdateCarousel) {
    window.updateCarousel = function() {
        _origUpdateCarousel();
        markCenterCarouselItem();
    };
}

window.addEventListener('resize', markCenterCarouselItem);

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(markCenterCarouselItem, 200);
});

// Funciones de los botones
// Nota: esta es una plantilla de ejemplo, así que los botones de
// "¿Cómo llegar?", "Subir Fotos" y "Confirmar Asistencia" no llevan a
// ningún enlace real todavía. Cuando se use para una boda real, basta con
// reemplazar cada URL de ejemplo por el enlace definitivo (Google Maps,
// álbum de fotos compartido, formulario de RSVP, etc.).
function openLocation(location) {
    const urls = {
        ceremony: 'https://maps.app.goo.gl/ZrLns3ojGyXFq8r69',
        reception: 'https://maps.app.goo.gl/sH4gadzoQi62yjDc8'
    };
    const url = urls[location];
    if (url) {
        window.open(url, '_blank', 'noopener');
    }
}

const PHOTO_ALBUM_URL = 'https://photos.app.goo.gl/mjsW1p5QdpDfmkb39';

function sharePhotos() {
    // Abre el álbum compartido de Google Fotos en una pestaña nueva
    // (en el celular abre la app de Google Fotos si está instalada).
    const win = window.open(PHOTO_ALBUM_URL, '_blank');
    if (win) {
        win.opener = null;
    } else {
        // Si el navegador bloqueó la pestaña nueva, abrir en la misma
        window.location.href = PHOTO_ALBUM_URL;
    }
}

function showDressCode() {
    const modal = document.getElementById('dresscodeModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeDressCodeModal() {
    // El click dentro de la tarjeta del modal usa stopPropagation(), así que
    // esta función solo se dispara al hacer click en el fondo oscuro o en la X.
    const modal = document.getElementById('dresscodeModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function showTips() {
    const modal = document.getElementById('tipsModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeTipsModal() {
    const modal = document.getElementById('tipsModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function showGifts() {
    const modal = document.getElementById('giftModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeGiftModal(event) {
    const modal = document.getElementById('giftModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

const WHATSAPP_NUMBER = '18297578864';
const WHATSAPP_MESSAGE = 'Confirmo mi asistencia a la boda de Manuel & Margaret';

function confirmAttendance() {
    const url = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(WHATSAPP_MESSAGE);
    const win = window.open(url, '_blank');
    if (win) { win.opener = null; } else { window.location.href = url; }
}

// Copiar número de cuenta (mesa de regalos)
function copyAccount(number, btn) {
    const done = () => {
        if (btn) { const t = btn.textContent; btn.textContent = '¡Copiado!'; btn.classList.add('copied');
            setTimeout(() => { btn.textContent = t; btn.classList.remove('copied'); }, 1800); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(number).then(done).catch(() => fallbackCopy(number, done));
    } else { fallbackCopy(number, done); }
}
function fallbackCopy(text, cb) {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); cb(); } catch (e) {}
    document.body.removeChild(ta);
}

// Sistema de Toast
function showToast(title, message) {
    const toast = document.getElementById('toast');
    const toastContent = document.getElementById('toastContent');
    
    toastContent.innerHTML = `
        <h4 style="font-weight: 700; color: #fff; margin-bottom: 0.35rem; letter-spacing: 0.2px;">${title}</h4>
        <p style="color: #ddd;">${message}</p>
    `;
    
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

// Nota: el efecto de portada ahora se logra 100% con CSS (hero fijo detrás
// del contenido, ver .hero-section y .content en CCSB.css), igual que en
// boda100L. Ya no hace falta mover nada por JS en el scroll.

// Saludo personalizado por invitado/familia, leído desde la URL.
// Formatos soportados:
//   ?invitados=Juan Arias,Yerianny Arias,Valery Arias
//   ?familia=Arias
function initializeGuestGreeting() {
    const params = new URLSearchParams(window.location.search);
    const invitadosParam = params.get('invitados');
    const familiaParam = params.get('familia');

    const section = document.getElementById('guestSection');
    const badge = document.getElementById('guestBadge');
    const subtitle = document.getElementById('guestSubtitle');
    const greeting = document.getElementById('guestGreeting');
    if (!section || !badge || !subtitle || !greeting) return;

    let names = [];

    if (invitadosParam) {
        // URLSearchParams ya decodifica: un segundo decodeURIComponent rompía
        // la página si un nombre traía el signo %
        names = invitadosParam.split(',').map(n => n.trim()).filter(Boolean);
    } else if (familiaParam) {
        names = [`Familia ${familiaParam.trim()}`];
    }

    if (names.length === 0) return;

    // Badge con el total de invitados
    badge.textContent = names.length;

    // Subtítulo de acompañantes: solo tiene sentido cuando hay más de un
    // nombre individual (no aplica al formato "Familia X")
    const companions = invitadosParam ? names.length - 1 : 0;
    if (companions > 0) {
        subtitle.textContent = `(${companions} acompañante${companions > 1 ? 's' : ''})`;
        subtitle.style.display = 'block';
    } else {
        subtitle.style.display = 'none';
    }

    // Limpiar contenido previo
    greeting.innerHTML = '';

    names.forEach((name, index) => {
        const nameSpan = document.createElement('span');
        const colorIndex = (index % 4) + 1;
        nameSpan.className = `guest-name color-${colorIndex}`;
        nameSpan.textContent = name;
        greeting.appendChild(nameSpan);
    });

    section.style.display = 'block';
}

// Forzar limpieza de caches en clientes antiguos
(function() {
  function clearCaches() {
    if ('caches' in window) {
      caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => reg.unregister());
      }).catch(() => {});
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', clearCaches);
  } else {
    clearCaches();
  }
})();


// =========================================================
// Aparición elegante de la información al hacer scroll
// Cada bloque sube suavemente desde un leve desenfoque; los elementos
// hermanos aparecen en cascada y los separadores florales se abren
// desde el centro. Al terminar, cada elemento recupera sus estilos
// originales (hovers y animaciones propias siguen funcionando).
// =========================================================
function initializeScrollReveal() {
    if (!('IntersectionObserver' in window)) return; // sin soporte: todo visible

    const groups = [
        // [selector, variante]
        ['.content > .section-divider img', 'wipe'],
        ['.guest-section', ''],
        ['.content .section-title', 'title'],
        ['.content .section-subtitle', ''],
        ['.countdown-item', ''],
        ['.event-card > *', ''],
        ['.camera-icon', 'zoom'],
        ['.carousel-container', 'zoom'],
        ['.carousel-counter', ''],
        ['.party-card', ''],
        ['.gift-icon', 'zoom'],
        ['.gifts-container > .btn-wedding', ''],
        ['.whatsapp-icon', 'zoom'],
        ['.rsvp-container > .btn-wedding', ''],
        ['.footer-content > *', '']
    ];

    const targets = [];
    groups.forEach(([sel, variant]) => {
        document.querySelectorAll(sel).forEach(el => {
            if (el.classList.contains('reveal')) return;
            el.classList.add('reveal');
            if (variant) el.classList.add('reveal--' + variant);
            targets.push(el);
        });
    });

    // Cascada: posición del elemento entre sus hermanos que también aparecen
    targets.forEach(el => {
        const siblings = Array.from(el.parentElement.children).filter(c => c.classList.contains('reveal'));
        el.style.setProperty('--rd', Math.min(siblings.indexOf(el), 5));
    });

    document.documentElement.classList.add('js-reveal');

    const cleanup = (el) => {
        // Quitar las clases al terminar para devolver los estilos originales
        el.classList.remove('reveal', 'reveal--zoom', 'reveal--title', 'reveal--wipe', 'is-visible');
        el.style.removeProperty('--rd');
    };

    const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el = entry.target;
            io.unobserve(el);
            el.classList.add('is-visible');
            const delay = (parseFloat(el.style.getPropertyValue('--rd')) || 0) * 130;
            setTimeout(() => cleanup(el), delay + 1800);
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

    targets.forEach(el => io.observe(el));

    // Al llegar al final de la página, mostrar lo que quede en pantalla
    // (el pie de página no siempre alcanza a cruzar el margen del detector)
    const revealAtBottom = () => {
        const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 60;
        if (!nearBottom) return;
        targets.forEach(el => {
            if (el.classList.contains('reveal') && !el.classList.contains('is-visible')) {
                const r = el.getBoundingClientRect();
                if (r.top < window.innerHeight && r.bottom > 0) {
                    io.unobserve(el);
                    el.classList.add('is-visible');
                    const delay = (parseFloat(el.style.getPropertyValue('--rd')) || 0) * 130;
                    setTimeout(() => cleanup(el), delay + 1800);
                }
            }
        });
    };
    window.addEventListener('scroll', revealAtBottom, { passive: true });
}
