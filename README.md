# Keyboard Warrior Stickman: Typing Beat 'Em Up 🥋⌨️

> **An authentic 1:1 open-source clone of the Steam beat 'em up phenomenon [Keyboard Warrior Stickman: Typing Beat 'Em Up](https://store.steampowered.com/app/4691530/Keyboard_Warrior_Stickman__Typing_Beat_Em_Up/) (by Good Knight Collective / itch.io Meme Combo Maker).**

Built with **Three.js WebGL 2.5D rendering**, **animated die-cut notebook-paper stickmen**, **power-up auras and glowing hair**, **ten original arenas**, **low-latency mechanical keyboard audio**, and **Devil May Cry style combat**.

---

## 🎮 What's in the game

### 1. 📜 Animated paper-cutout fighters (60 FPS)
- Stickmen are **drawn live from a skeleton** (head, torso, two-segment arms and legs) and die-cut from ruled, crumpled notebook paper, so every limb really moves: guard, walk cycle, jabs, cross, kick, uppercut, dive slam, hurt, knock-down, dash and power-up poses.
- **Planted on the floor**: the lowest point of every pose is pinned to the ground line, and backdrops share one floor height, so nothing floats or clips.
- **Real contact**: hits make the hero lunge into range, the enemy flashes, slides back, and walks in to fight again. Air launches pop the enemy up while the hero rises with them to keep the juggle going.
- **A living enemy**: it runs in from off-screen, chases, winds up and strikes. Typos invite a counter-attack; a well-timed **Tab** dodge is rewarded with slow motion. Each knockout brings a tougher foe with new gear (glasses, headband, mohawk, horns).

### 2. ⚡ Power forms: glowing hair, auras and lightning
Style rank drives the hero's transformation (or force one from the menu):

| Rank | Form | Look |
| :--- | :--- | :--- |
| D - B | Base | White cap |
| A, S | **Golden Rage** | Spiky gold hair, flame aura, rising embers |
| SS | **Blue Surge** | Blue hair, blue aura, crackling lightning |
| SSS | **Silver Instinct** | Silver hair, white aura, afterimage trail |

Powering up triggers a charge pose, ground shockwave, flying debris, a screen flash and a callout. Forms also scale damage and recolour hit sparks and the beam.

### 3. 💥 More effects
- **Beam finisher**: complete a sentence to charge an energy orb and fire a screen-wide beam.
- Hit sparks, shockwave rings, ground craters, dust, speed lines, afterimages, screen shake, punch zoom, hit-stop and KO slow motion.
- Floating combat text (CRIT!, FINISHER!, AIR LAUNCH!, GROUND SLAM!, K.O.!).
- Per-arena ambience: dust, petals, rain, embers, stars, pollen.

### 4. 🤣 Meme queue: every prompt is a meme
The prompts are the **catchphrases of 72 meme clips** (from the Meme Duel clip folder). The **MEME QUEUE** panel (top-left) shows the meme you're typing now and the next three, each with its thumbnail and the special move waiting at the end:

- **Every letter** you type throws a strike (jab, cross, punch; every 4th hit is a finisher kick).
- **Every finished word** lands a bonus hit with a spark and the word popping up.
- **Finishing the phrase** plays *that meme's clip with its original audio* and unleashes its special move:

| Move | What it does |
| :--- | :--- |
| **Beam Finisher** | Charge an orb, fire a screen-wide beam |
| **Meteor Slam** | Launch the enemy skyward, then spike them into the floor |
| **Meme Flurry** | Ten rapid strikes ending in a launching kick |
| **Time Skip** | Screen goes dark, the meme's title card appears, and all the damage lands at once |
| **Power Surge** | Jump to the next power form for 10 seconds and heal |

Each meme's move comes from its tags (hype memes fire the beam, rage memes slam, time-card memes skip time, and so on).

The other clips pop up as **reaction videos** in a TV frame with a caption: laughter on a KO, "I am sorry" after three typos, hype on combo milestones and power-ups, a time-skip card when a new foe arrives, and "waiting..." memes if you go idle. Choose Off / Rare / Normal / Chaos and the meme volume in the menu (ESC). Music dips while a clip plays.

Clips are 360p copies trimmed to 6 seconds (about 12 MB in `assets/memes/`). To rebuild them from the Drive folder: `npm run fetch:memes` (needs ffmpeg; `-- --retag` rebuilds only the manifest). Edit the `PHRASES` and `TAG_RULES` tables in `scripts/fetch_memes.js` to change phrases, tags or moves.

### 5. 🎚️ Three difficulty levels
Pick your opponent on the start screen (keys **1 / 2 / 3**) or switch any time in the menu (ESC). The level is remembered.

| | Easy · Chill Bot | Medium · Keyboard Warrior | Hard · Final Boss |
| :--- | :---: | :---: | :---: |
| Bot health | 70% | 100% | 150% |
| Bot hit damage | 3 | 5 | 8 |
| Attack telegraph (time to dodge) | 0.55 s | 0.30 s | 0.20 s |
| Time between attacks | 5.5-8 s | 3-4.8 s | 1.6-2.8 s |
| Counters your typos | never | half the time | always |
| Double swings | no | no | 35% of attacks |
| Sidesteps your strikes | no | no | 12% |
| Can finish you off while you idle | no | no | yes |
| Score multiplier | 0.8x | 1x | 1.6x |

Every number lives in one table, `src/combat/difficulty.js`.

### 6. 🏟️ Ten arenas (Meme Combo Maker menu, ESC)
Rocky Wasteland, Sunset Dojo, Neon Rooftop, Volcano Pit, Orbital Platform, Rolling Meadow, The Desk, Retro CRT Grid, Sketchpad, and a pure `#00ff00` **Green Screen** for recording. Backdrops are original art generated by `npm run generate:arenas`, and each arena picks fitting music.

### 7. ⌨️ Controls that never fight the typing
Every letter and symbol belongs to the prompt. Walking uses the arrow keys only (WASD used to swallow **A** and **D**).

### 8. ⚡ DMC-style rank & combo engine
`D (DISMAL)` to `SSS (SMOKIN' SEXY STYLE!)` with a decaying style meter, a hit counter and a score multiplier. Fighter health bars sit at the top.

### 9. 🪶 Light on the machine, quick to start
- **Adaptive graphics** (menu: Auto / High / Low): the game watches its frame rate and trims resolution, particles, glow and lightning if your device struggles, and restores them when it has headroom. Calm fighters redraw less often on slower devices, and phones start one step down.
- **No wait for memes**: the clip for the phrase you're typing and the next two are prefetched, the rest trickle in while you play, and every game module loads in parallel.
- **Small first load**: about 1 MB over the wire on a first visit, interactive in well under a second on a fast connection. Fonts no longer block the first paint, text assets are Brotli-compressed, and media is cached for a week.

---

## 🚀 Quick Start

### 1. Run as Windows Desktop App (Electron)
```bash
npm install
npm start
```

### 2. Run in Web Browser
```bash
npm run serve
```
Open your browser at `http://localhost:3000`.

### 3. Run the Automated Verification Test Suite
```bash
npm test
```

### 4. Regenerate the arena backdrops
```bash
npm run generate:arenas            # all ten
node scripts/generate_arenas.js dojo lava   # just some
```
Backdrops are painted procedurally into `assets/arenas/` (needs the `@napi-rs/canvas` dev dependency). Each keeps its floor at 62% of the image height; keep that if you add your own.

### 5. Build Standalone Desktop Executable (.exe)
```bash
npm run build:app
```
Packages the complete standalone portable executable at:
`dist/TypeFighter/TypeFighter.exe`

### 6. Host it on the web (Vercel or any static host)
The game is plain static files, so there is nothing to render on a server.
```bash
npm run build:web            # writes web-dist/, a lean copy (about 27 MB) of only what the game uses
cd web-dist && vercel --prod # first time: `vercel link --project meme-duel` here
```
`web-dist` also gets a `vercel.json` with cache headers. To preview the hosted build locally: `ROOT=web-dist PORT=3100 npm run serve`.

---

## 🕹️ Controls

| Key | Action |
| :--- | :--- |
| **A-Z / 0-9 / Symbols** | Type the meme's catchphrase; each correct key throws a strike, each word adds a bonus hit, the finished phrase fires a special move |
| **Spacebar** | Air Launcher *(launches the enemy; the hero floats up to juggle)*. Types a space when the prompt needs one |
| **Enter** | Ground Slam *(spikes an airborne enemy into the floor)* |
| **Tab** | Dash: closes the gap when far, dodges back when close (brief invulnerability) |
| **Caps Lock** or **`** | Toggle Rage *(red aura, extra damage, at least Golden Rage)* |
| **Left / Right arrows** | Walk |
| **ESC** | Meme Combo Maker: arena, power form, custom phrase, volume |
| **F11** | Toggle fullscreen (desktop app) |

Finish a meme's phrase to play its clip and fire its special move.

---

## 📄 License
MIT Open Source License. Gameplay is a fan homage inspired by Good Knight Collective's *Keyboard Warrior Stickman*. Fighters and arenas are drawn in code by this project.
