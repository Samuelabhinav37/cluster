/* Copied from the portfolio (samuel-portfolio-site, public/scripts/sky-engine.js).
   Edit it there and copy it here. Cluster uses the 'night' tone behind onboarding. */
/* The site sky: night cloud banks drifting across a navy sky, three depths
   of GPU stars, and the odd shooting star. Every page's background
   (components/SkyBackground.astro boots it via sky.js).

   Touches no DOM, so the same code runs on the main thread or inside
   sky-worker.js on an OffscreenCanvas (sky.js decides which). The page
   hands it two canvases and talks to it through handle(msg):
     { type:'size', w, h, dpr }     viewport in CSS px
     { type:'running', on }         tab hidden/visible
     { type:'look', sky, cloud, cover, stars }   live mix (the _sky-tune.html preview)
     { type:'tone', name }          switch tone live (the homepage light theme)

   Tiers, picked by the page:
     full   desktop: full-detail clouds, shooting stars
     calm   desktop reading pages (the blog): the same clouds, rarer meteors
     lite   phones/tablets: cheaper clouds, shooting stars
     still  reduced motion: one rendered frame

   Tones, also picked by the page (opts.tone): the default navy night,
   'aged', a faded umber night that sits behind the contact page's old print,
   or 'bright', a lighter night with whiter clouds behind the blog index,
   or 'space', the homepage: black space, dim clouds (tuned in _sky-tune.html).

   The flying cast (satellites, the police/robber chase over vaults, the
   contact courier, aircraft, freighter) was removed in October 2026: the
   sky reads calmer as clouds and stars alone.

   Shooting stars sit far back: the cloud density at their position is
   computed on the CPU with the shader's own noise, so they fade out inside
   thick cloud. */
(function(root){
  'use strict';

  var TIERS = {
    full:  { res:.5,  oct:6, fps:30, meteorGap:[25,55] },
    calm:  { res:.45, oct:5, fps:24, meteorGap:[45,90] },
    lite:  { res:.35, oct:4, fps:24, meteorGap:[35,75] },
    still: { res:.5,  oct:6, fps:0,  meteorGap:null }
  };

  /* The "Night clouds" look from the workbench, frozen. */
  var LOOK = {
    deep:[.020,.035,.090], body:[.090,.141,.271], cloud:[.600,.659,.800], rim:[.875,.902,.961],
    scale:1.15, warp:.65, drift:1.4, vign:.9, bright:1,
    starDen:1, starSize:.9, starBright:.8, twinkle:.38, glow:.12, depth:1
  };

  /* ══════════ SKY SHADER ══════════ */
  function fragSrc(oct, starBright){
    return 'precision highp float;\n' +
    '#define OCT ' + oct + '\n' +
    'uniform float uTime; uniform vec2 uRes;\n' +
    'uniform vec3 uDeep,uBody,uCloud,uRim;\n' +
    'uniform float uSkyB,uCloudB,uCover,uStarB,uInk;\n' +
    'float h21(vec2 p){p=fract(p*vec2(234.34,435.345));p+=dot(p,p+34.23);return fract(p.x*p.y);}\n' +
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),u.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x),u.y);}\n' +
    'float fbm(vec2 p){float v=0.,a=.52,fr=1.;mat2 r=mat2(.877,.480,-.480,.877);for(int i=0;i<OCT;i++){v+=a*noise(p*fr);p=r*p;fr*=2.05;a*=.48;}return v;}\n' +
    /* one cell-grid star layer; a fraction of cells hold a jittered, twinkling star */
    'vec3 starLayer(vec2 p,float scale,float density,float t,float glowAmt){\n' +
    '  vec2 g=p*scale; vec2 id=floor(g); vec2 f=fract(g)-.5;\n' +
    '  float h=h21(id); if(h>density) return vec3(0.);\n' +
    '  vec2 o=vec2(h21(id+11.3),h21(id+27.1))-.5; float d=length(f-o*.8);\n' +
    '  float b=h21(id+5.7); float tw=' + (1-LOOK.twinkle).toFixed(3) + '+' + LOOK.twinkle.toFixed(3) + '*(.5+.5*sin(t*(.8+b*2.5)+b*60.));\n' +
    '  float core=smoothstep(' + (.1*LOOK.starSize).toFixed(3) + ',0.,d);\n' +
    '  float glow=exp(-d*' + (12/LOOK.starSize).toFixed(2) + ')*glowAmt*step(.80,b);\n' +
    '  float k=h21(id+41.9);\n' +
    '  vec3 tint=mix(vec3(.92,.95,1.), k<.5?vec3(.66,.78,1.):vec3(1.,.84,.66), abs(k-.5)*1.6);\n' +
    '  return tint*(core*(.35+.65*b)+glow)*tw;\n' +
    '}\n' +
    /* day stars: on a light sky stars must stay lighter than the sky (dark
       specks read as dust), so fewer, larger white points with a halo; the
       brightest carry a four-point glint and twinkle more */
    'vec3 dayLayer(vec2 p,float scale,float density,float t){\n' +
    '  vec2 g=p*scale; vec2 id=floor(g); vec2 f=fract(g)-.5;\n' +
    '  float h=h21(id); if(h>density) return vec3(0.);\n' +
    '  vec2 o=(vec2(h21(id+11.3),h21(id+27.1))-.5)*.6; vec2 q=f-o; float d=length(q);\n' +
    '  float b=h21(id+5.7); float tw=.55+.45*sin(t*(.6+b*1.8)+b*60.);\n' +
    '  float core=smoothstep(.07,0.,d);\n' +
    '  float halo=exp(-d*14.)*.55;\n' +
    '  float arms=(exp(-abs(q.y)*90.)*exp(-abs(q.x)*9.)+exp(-abs(q.x)*90.)*exp(-abs(q.y)*9.))*step(.7,b)*.9;\n' +
    '  float k=h21(id+41.9); vec3 tint=mix(vec3(1.,1.,1.),vec3(.86,.93,1.),k);\n' +
    '  return tint*(core+halo+arms*tw)*(.45+.55*b)*mix(1.,tw,.6);\n' +
    '}\n' +
    'vec3 dayStars(vec2 st,float t){\n' +
    '  return .8*dayLayer(st+vec2(t*.0065,0.),30.,.09,t)+1.1*dayLayer(st+vec2(t*.0130,0.),13.,.16,t);\n' +
    '}\n' +
    'vec3 stars(vec2 st,float t){\n' +
    '  vec3 c=vec3(0.);\n' +
    '  c+=.55*starLayer(st+vec2(t*.0030,0.),95.,' + (.12*LOOK.starDen).toFixed(3) + ',t,0.);\n' +
    '  c+=.85*starLayer(st+vec2(t*.0065,0.),48.,' + (.07*LOOK.starDen).toFixed(3) + ',t,' + LOOK.glow.toFixed(3) + ');\n' +
    '  c+=1.0*starLayer(st+vec2(t*.0130,0.),22.,' + (.045*LOOK.starDen).toFixed(3) + ',t,' + (LOOK.glow*1.4).toFixed(3) + ');\n' +
    '  return c*' + starBright.toFixed(3) + ';\n' +
    '}\n' +
    'void main(){\n' +
    '  vec2 uv=gl_FragCoord.xy/uRes.xy; vec2 st=uv; st.x*=uRes.x/uRes.y;\n' +
    '  float t=uTime*.02*' + LOOK.drift.toFixed(3) + ';\n' +
    '  vec2 p=st*' + LOOK.scale.toFixed(3) + '+vec2(t*.55,0.);\n' +
    '  vec2 wq=vec2(fbm(p*1.7+t*.1),fbm(p*1.7+vec2(4.,2.)));\n' +
    '  vec2 pw=p+' + LOOK.warp.toFixed(3) + '*wq;\n' +
    '  float base=fbm(pw);\n' +
    '  float c=smoothstep(uCover,uCover+.36,base);\n' +
    /* lit from the upper left: brighter where the density falls off that way */
    '  float shade=.78+3.2*(base-fbm(pw+vec2(.035,-.035)));\n' +
    '  vec3 sky=mix(uDeep,uBody,smoothstep(0.,1.,uv.y))*uSkyB;\n' +
    '  vec3 cl=mix(uCloud,uRim,smoothstep(.95,1.25,shade))*uCloudB;\n' +
    '  vec3 col=mix(sky,cl*clamp(shade,mix(.45,.8,uInk),1.25),c*mix(.85,.95,uInk))*' + LOOK.bright.toFixed(3) + ';\n' +
    '  vec2 v=uv-.5; col*=mix(pow(clamp(1.-dot(v,v*' + LOOK.vign.toFixed(3) + '),0.,1.),.8),1.,uInk*.8);\n' +
    /* a light sky (uInk 1) gets the day stars, thinning toward the pale horizon */
    '  if(uInk>.5) col+=dayStars(st,uTime)*uStarB*(1.-c)*smoothstep(.1,.8,uv.y);\n' +
    '  else col+=stars(st,uTime)*uStarB*(1.-c);\n' +
    '  gl_FragColor=vec4(clamp(col,0.,1.),1.);\n' +
    '}';
  }
  var VERT = 'attribute vec2 p; void main(){ gl_Position=vec4(p,0.,1.); }';

  /* ══════════ CPU twin of the cloud density ══════════
     Same maths as the shader so a craft fades exactly where a cloud is drawn. */
  function fract(x){ return x - Math.floor(x); }
  function h21(x, y){
    x = fract(x*234.34); y = fract(y*435.345);
    var d = x*(x+34.23) + y*(y+34.23); x += d; y += d;
    return fract(x*y);
  }
  function noise(x, y){
    var ix = Math.floor(x), iy = Math.floor(y), fx = x-ix, fy = y-iy;
    var ux = fx*fx*(3-2*fx), uy = fy*fy*(3-2*fy);
    var a = h21(ix,iy), b = h21(ix+1,iy), c = h21(ix,iy+1), d = h21(ix+1,iy+1);
    return (a + (b-a)*ux) + ((c + (d-c)*ux) - (a + (b-a)*ux))*uy;
  }
  function fbm(x, y, oct){
    var v = 0, a = .52, fr = 1;
    for(var i=0;i<oct;i++){
      v += a*noise(x*fr, y*fr);
      var nx = .877*x - .480*y, ny = .480*x + .877*y; x = nx; y = ny;
      fr *= 2.05; a *= .48;
    }
    return v;
  }
  function smooth(e0, e1, x){ var t = Math.min(1, Math.max(0, (x-e0)/(e1-e0))); return t*t*(3-2*t); }

  /* the 'aged' tone: the same sky, faded like an old photograph */
  var AGED = { deep:[.030,.026,.024], body:[.118,.100,.084], cloud:[.470,.420,.355], rim:[.760,.700,.600] };
  /* the 'mono' tone: the same sky in black and white */
  var MONO = { deep:[.024,.024,.024], body:[.100,.100,.100], cloud:[.440,.440,.440], rim:[.740,.740,.740] };
  /* the 'night' tone: the black-and-white sky with brighter stars (the photos page) */
  var NIGHT = { deep:MONO.deep, body:MONO.body, cloud:MONO.cloud, rim:MONO.rim, stars:1.6 };
  /* the 'bright' tone: a lighter navy with whiter clouds (the blog index) */
  var BRIGHT = { deep:[.030,.050,.120], body:[.120,.180,.330], cloud:[.800,.840,.930], rim:[.970,.980,1.000] };
  /* the 'space' tone: the default look mixed down (homepage, 2026-11-08) */
  var SPACE = { deep:LOOK.deep, body:LOOK.body, cloud:LOOK.cloud, rim:LOOK.rim, mix:{ sky:0, cloud:.4, cover:.429, stars:.95 } };
  /* the day sky for the homepage light theme (2026-11-08): deep = horizon, body = top; ink:1 = the day stars */
  var DAY  = { deep:[.80,.88,.97], body:[.50,.68,.92], cloud:[.96,.97,1], rim:[1,1,1], ink:1, mix:{ sky:.9, cloud:1, cover:.484, stars:.1 } };
  var TONES = { aged:AGED, mono:MONO, night:NIGHT, bright:BRIGHT, space:SPACE, day:DAY };

  function create(skyCanvas, fxCanvas, opts){
    var tier = TIERS[opts && opts.tier] || TIERS.full;
    var tone = TONES[opts && opts.tone] || LOOK;
    var W = 1, H = 1, DPR = 1, running = true;
    var mixL = Object.assign({ sky:1, cloud:1, cover:.44, stars:1 }, tone.mix);   /* 1 = the look above; 'look' messages change it */
    /* a different sky on every visit, but one sky per visit: with a session
       clock (sky.js) every page draws the same moment, so moving between
       pages never restarts the background */
    var clock = opts && opts.clock;
    function clockT(){ return clock.seed + (Date.now() - clock.at) / 1000 * .55; }
    var sceneT = clock ? clockT() : 40 + Math.random()*400;
    var raf = root.requestAnimationFrame ? root.requestAnimationFrame.bind(root) : function(f){ return setTimeout(function(){ f(Date.now()); }, 1000/30); };

    /* ── GL ── */
    var gl = null, U = {};
    try{ gl = skyCanvas.getContext('webgl', { antialias:false, alpha:false, depth:false, stencil:false, preserveDrawingBuffer:false }); }catch(e){ gl = null; }
    if(gl){
      var mk = function(type, src){ var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){ console.warn('sky shader:', gl.getShaderInfoLog(s)); return null; } return s; };
      var vs = mk(gl.VERTEX_SHADER, VERT), fs = mk(gl.FRAGMENT_SHADER, fragSrc(tier.oct, tone.stars || LOOK.starBright));
      if(vs && fs){
        var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
        if(gl.getProgramParameter(pr, gl.LINK_STATUS)){
          gl.useProgram(pr);
          var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
          var loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
          ['uTime','uRes','uDeep','uBody','uCloud','uRim','uSkyB','uCloudB','uCover','uStarB','uInk'].forEach(function(n){ U[n] = gl.getUniformLocation(pr, n); });
          gl.uniform3fv(U.uDeep, tone.deep); gl.uniform3fv(U.uBody, tone.body);
          gl.uniform3fv(U.uCloud, tone.cloud); gl.uniform3fv(U.uRim, tone.rim); gl.uniform1f(U.uInk, tone.ink || 0);
        } else gl = null;
      } else gl = null;
    }
    var ctx = fxCanvas.getContext('2d');

    function drawSky(){
      if(!gl) return;
      gl.viewport(0, 0, skyCanvas.width, skyCanvas.height);
      gl.uniform1f(U.uTime, sceneT);
      gl.uniform2f(U.uRes, skyCanvas.width, skyCanvas.height);
      gl.uniform1f(U.uSkyB, mixL.sky); gl.uniform1f(U.uCloudB, mixL.cloud);
      gl.uniform1f(U.uCover, mixL.cover); gl.uniform1f(U.uStarB, mixL.stars);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    /* cloud density 0..1 at a viewport point, matching the shader */
    function density(x, y){
      var u = x / W, v = 1 - y / H;
      var sx = u * (W/H), sy = v;
      var t = sceneT * .02 * LOOK.drift;
      var px = sx*LOOK.scale + t*.55, py = sy*LOOK.scale;
      var wx = fbm(px*1.7 + t*.1, py*1.7 + t*.1, tier.oct), wy = fbm(px*1.7 + 4, py*1.7 + 2, tier.oct);
      var base = fbm(px + LOOK.warp*wx, py + LOOK.warp*wy, tier.oct);
      return smooth(mixL.cover, mixL.cover + .36, base) * .85;
    }
    /* how much of something at depth z shows through the cloud at (x,y) */
    function seen(x, y, z){
      if(x < -80 || y < -80 || x > W+80 || y > H+80) return 0;
      var d = density(x, y);
      return 1 - smooth(.08, .7, d) * (1 - z);
    }

    function rnd(a, b){ return a + Math.random()*(b-a); }
    function glow(x, y, r, rgb, a){
      if(a <= .003 || r <= 0) return;
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(' + rgb + ',' + a.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
    var meteors = [], meteorIn = tier.meteorGap ? rnd(6, 14) : Infinity;

    function stepMeteors(dt){
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'round';
      if(!tier.meteorGap) return;
      meteorIn -= dt;
      if(meteorIn <= 0){
        meteorIn = rnd(tier.meteorGap[0], tier.meteorGap[1]);
        var dir = Math.random() < .5 ? 1 : -1, an = rnd(.35, .6), sp = rnd(520, 720);
        meteors.push({ x:rnd(W*.1, W*.9), y:rnd(-10, H*.35), vx:dir*Math.cos(an)*sp, vy:Math.sin(an)*sp, life:rnd(.6, .9), t:0 });
      }
      for(var m=meteors.length-1;m>=0;m--){
        var me = meteors[m]; me.t += dt; me.x += me.vx*dt; me.y += me.vy*dt;
        if(me.t >= me.life){ meteors.splice(m, 1); continue; }
        var k = me.t/me.life, ma = Math.sin(k*Math.PI) * seen(me.x, me.y, 0), len = .16;
        var tx = me.x - me.vx*len, ty = me.y - me.vy*len;
        var g = ctx.createLinearGradient(tx, ty, me.x, me.y);
        g.addColorStop(0, 'rgba(240,246,255,0)'); g.addColorStop(1, 'rgba(240,246,255,' + (.85*ma).toFixed(3) + ')');
        ctx.strokeStyle = g; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(me.x, me.y); ctx.stroke();
        glow(me.x, me.y, 4, '240,246,255', .5*ma);
      }
    }

    /* ══════════ LOOP ══════════ */
    var last = 0, frameMin = tier.fps ? 1000/tier.fps : 0, scheduled = false;
    function frame(now){
      scheduled = false;
      if(!running) return;
      if(tier.fps){ schedule(); if(last && now - last < frameMin - 1) return; }
      var dt = last ? Math.min((now - last)/1000, .1) : 0; last = now;
      sceneT = clock ? clockT() : sceneT + dt * .55;   /* the site's background pace */
      drawSky();
      if(tier.fps) stepMeteors(dt);
    }
    function schedule(){ if(!scheduled){ scheduled = true; raf(frame); } }
    function renderOnce(){ drawSky(); if(ctx){ ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0, 0, fxCanvas.width, fxCanvas.height); } }

    function handle(m){
      if(m.type === 'size'){
        W = Math.max(1, m.w); H = Math.max(1, m.h); DPR = Math.min(m.dpr || 1, tier === TIERS.full ? 2 : 1.5);
        var q = Math.min(m.dpr || 1, 1.5) * tier.res;
        skyCanvas.width = Math.max(2, Math.round(W*q)); skyCanvas.height = Math.max(2, Math.round(H*q));
        fxCanvas.width = Math.round(W*DPR); fxCanvas.height = Math.round(H*DPR);
        if(!tier.fps) renderOnce();
      } else if(m.type === 'look'){
        ['sky','cloud','cover','stars'].forEach(function(k){ if(typeof m[k] === 'number' && isFinite(m[k])) mixL[k] = m[k]; });
        if(!running || !tier.fps) drawSky();   /* paused or still: show the change now */
      } else if(m.type === 'tone'){
        var t = TONES[m.name] || LOOK;
        mixL = Object.assign({ sky:1, cloud:1, cover:.44, stars:1 }, t.mix);
        if(gl){ gl.uniform3fv(U.uDeep, t.deep); gl.uniform3fv(U.uBody, t.body); gl.uniform3fv(U.uCloud, t.cloud); gl.uniform3fv(U.uRim, t.rim); gl.uniform1f(U.uInk, t.ink || 0); }
        if(!running || !tier.fps) drawSky();
      } else if(m.type === 'running'){
        running = !!m.on; last = 0;
        if(running && tier.fps) schedule();
      }
    }
    if(tier.fps) schedule();

    return { handle:handle, hasGL:!!gl };
  }

  root.SiteSky = { create:create };
})(typeof self !== 'undefined' ? self : this);
