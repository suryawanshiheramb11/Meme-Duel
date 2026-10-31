# Meme Duel

**A typing beat 'em up where every sentence is a meme.** You type a meme's catchphrase to punch a stick-figure bot to bits. Every letter throws a strike, every finished word lands a bonus hit, and finishing the whole phrase plays that meme's clip (with its original audio) floating over your fighter's head while a matching special move fires. The bot fights back with telegraphed attacks, blocks, reads your moves, and on Hard throws unblockable ultras at you.

**Play it now:** https://meme-duel-seven.vercel.app

---

## Contents

1. [Quick start](#quick-start)
2. [How to play](#how-to-play) (rounds and the fatality included)
   - [Playing online](#playing-online)
3. [The memes](#the-memes)
4. [The bot and the three difficulty levels](#the-bot-and-the-three-difficulty-levels)
5. [Power forms, rank and score](#power-forms-rank-and-score)
6. [Arenas, effects and audio](#arenas-effects-and-audio)
7. [Menu and settings](#menu-and-settings)
8. [Performance](#performance)
9. [Hosting on Vercel](#hosting-on-vercel)
10. [Customising the game](#customising-the-game)
11. [Project structure](#project-structure)
12. [Tests](#tests)
13. [Troubleshooting](#troubleshooting)
14. [Credits and legal](#credits-and-legal)

---

## Quick start

**Just play:** open the link above in a desktop browser. It has been tested in Chromium (Chrome and Edge); other browsers should work but haven't been checked. Pick a difficulty, click the game once, and start typing. The layout also fits a phone-sized screen (tested in emulation), but you need a keyboard to type, so a laptop is the real experience.

**Run it locally:**

```bash
npm install
npm run serve        # then open http://localhost:3000
```

Node 18 or newer is enough to serve it. The game is plain static files: there is no bundler, no server logic and nothing to compile.

| Command | What it does |
| :--- | :--- |
| `npm run serve` | Serves the game on port 3000. `PORT=4000 npm run serve` changes the port; `ROOT=web-dist npm run serve` previews the hosted build. |
| `npm test` | Runs the full check suite (172 checks). See [Tests](#tests). |
| `npm run build:web` | Builds the slim copy that gets hosted into `web-dist/`. See [Hosting](#hosting-on-vercel). |
| `npm run fetch:memes` | Downloads, crops, compresses and tags the meme clips. Needs `ffmpeg`. See [Customising](#customising-the-game). |
| `npm run generate:arenas` | Repaints the nine arena backgrounds. See [Customising](#customising-the-game). |
| `npm start` | Opens the game in an Electron desktop window. **Not tested** in the current version. |
| `npm run build:app` | Packages the Electron app for Windows. **Not tested** in the current version. |

Browsers only allow sound after you interact with the page, so the music and meme audio start on your first click or key press.

---

## How to play

### The loop

A phrase is shown on a notebook-paper strip at the top, with a red box on the next letter to type. The **MEME QUEUE** panel on the left shows the meme you're typing now and the next three, each with a thumbnail and the special move waiting at the end.

1. **Type the next letter.** Each correct key throws a strike (jab, cross and punch in rotation). If you're out of reach, your fighter lunges in first. **Every 4th hit in a row is a finisher kick** with big knockback.
2. **Finish a word** (type the space after it) for a **bonus hit** with a spark and the word popping up.
3. **Finish the whole phrase.** Its meme plays overhead and its **special move** fires at the same moment. The next phrase appears immediately and you keep typing.
4. **Typos hurt.** A wrong key breaks your combo, costs style points and can invite a counter-attack from the bot.

Nothing ever pauses. Memes are overlays, not cutscenes: you keep typing, moving and fighting while they play.

### Controls

| Key | Action |
| :--- | :--- |
| **Letters, digits, symbols** | Type the phrase. Every printable key belongs to typing. |
| **Space** | Types a space when the phrase needs one. Otherwise it's the **air launcher**: an uppercut that sends the bot flying while you float up beside it for a juggle. |
| **Enter** | **Ground slam.** On an airborne bot it spikes it into the floor for heavy damage, a shockwave and a crater. On the ground it's a quick sweep. |
| **Tab** | **Dash.** From range it closes the gap. Up close it dodges backwards (or crosses over the bot if you're cornered). It gives 0.45 s of invulnerability: time it as the bot swings for a **perfect dodge**, slow motion and bonus style. |
| **← →** | Walk. |
| **↑** | **Jump.** Clears the bot's low sweep, and its ultra shockwave if you time it. |
| **↓** (hold) | **Guard.** Blocks most damage, but you hit 40% softer. It does not stop the ultra. |
| **Caps Lock** or **`** | **Rage** for 7 seconds: extra damage and at least the Golden Rage form. |
| **Esc** | Opens the menu (difficulty, arena, graphics, memes, custom phrase). |

Walking is on the arrow keys only, so that **A** and **D** stay available for typing.

On the start screen, **1 / 2 / 3** pick Easy / Medium / Hard (or click a card, or use ← → and Enter).

### Rounds, health and the fatality

A match is **first to two round wins** (best of three). Every round opens with a 7-second introduction ("ROUND 1 begins", "ROUND 2 begins again", and a red-lit "FINAL ROUND" when it is 1-1), a 3-2-1 countdown, then **FIGHT!**. The arena is picked before the fight (on the start screen, or in the online lobby, where the host's choice is used) and stays for the whole match. Fighters carry 2.4x the old health, so a round is a real fight rather than a few combos. A round ends on a KO, or when the 90-second clock runs out and whoever has more health left takes it. Between rounds the loser gets hit with *Emotional Damage*.

Win the deciding round by KO and the screen says **FINISH HIM!**. You have six seconds to tap the fatality code: **↓ ↓ → ← then Shift**. A meme-card storm (or a beam) then blows your opponent into paper confetti. Miss the window and you still win, just without the style points. A round won without taking damage is a **FLAWLESS VICTORY**.

---

## The store

**Store** on the landing page sells accessories for your fighter: headbands, hats, a crown, a halo, headphones, shades, round glasses, a monocle, an eye patch and a mustache (one head item and one face item at a time). You start with 150 coins and the Red Headband. Matches pay coins: 15 per round won, 60 for winning the match (20 for losing), and 40 for a fatality. What you buy is saved in your browser, worn in every fight, and shown to your online opponent.

## Playing online

**Play Online** on the landing page opens the lobby:

- **Quick Match** pairs you with the next person who is searching. Two players looking at the same time find each other in a few seconds.
- **Create Room** gives a five-letter code (and a copyable invite link, `?room=CODE`) and puts you in the room straight away. A friend types the code under **Join Room**, or just opens the link, and joins you there.
- Everyone, room or quick match, lands in the same **ready-up room**: you see who is in, each of you presses **READY** (or R), and the fight starts when both are ready.

Online duels are human against human: no bot, no secret moves, even health, same rounds and fatality. Hits are decided by the player being hit (so your own guard and dash always count), and the host keeps the clock.

It is peer-to-peer (WebRTC through PeerJS). The only shared service is PeerJS's free public matchmaking broker, which just introduces two browsers; game data goes straight between them. Two limits to know about: a few strict corporate or mobile networks block direct connections and there is no relay server, and the free broker is a community service with no uptime guarantee. To self-host the broker, run `npx peerjs --port 9000` and open the game with `?signal=localhost:9000`.

---

## The memes

### The queue: every prompt is a meme

The prompts are the catchphrases of **71 meme clips**. The queue is **sorted as a ladder** of special moves, so the fight keeps changing shape:

> flurry → slam → power surge → beam → time skip → (repeat)

Within each move the memes are shuffled. The panel on the left always shows what you're typing and what's coming.

### The memes match the move

Each phrase's special move is **hand-picked by what the line means**, so the action on screen matches the clip:

| Special move | What it does | Suits lines that are... |
| :--- | :--- | :--- |
| **Beam finisher** | Charge an energy orb at your hip, then fire a screen-wide beam that blasts the bot. | threats and big dramatic lines ("MAUT KO CHHU KE", "TAPA TAP") |
| **Meteor slam** | Launch the bot skyward, then spike it into the floor with a shockwave and crater. | violent or accusing lines ("KHOPDI TOR SALAY KA", "CHEATING KARTA HAI TU") |
| **Meme flurry** | Ten rapid strikes, the last one a launching kick. | mockery, laughing, cheering, impatience ("CLAP CLAP CLAP", "SHABASH BETA...") |
| **Time skip** | The screen goes dark, the meme's title card appears, you dash through the frozen bot and all the damage lands at once. | "later", "not today" time cards ("2000 YEARS LATER") |
| **Power surge** | Jump to your next power form for 10 seconds and heal 25 HP. | pity, courage and comeback lines ("HEY BHAGWAN") |

The full list lives in the `MOVES` table in `scripts/fetch_memes.js`. I picked these by reading each phrase and clip title, not by listening to every clip, so a few pairings may feel off. They're easy to change.

### Reaction memes

The other clips (and the phrase memes between phrases) pop up as **reactions to what just happened** to you or to the bot. The tag on each clip decides which reaction it can be used for:

| Moment | Reaction |
| :--- | :--- |
| You knock the bot out | laughter / "skill issue" (big moment) |
| Three typos within 3 seconds (or a lone one, sometimes) | apology / "bruh" |
| The bot hits you (and when you're knocked out) | "ouch" |
| You dodge, jump an attack, or the bot dodges, blocks or reads you | dodge / taunt |
| You power up to a new form, or go into Rage | power-up / rage |
| You air-launch or slam | launch / slam |
| Combo of 10 or 25 hits, or a rank-up | praise; 50, 100 or 200 hits gets hype |
| A new bot runs in | "here comes another" or a time-skip card |
| You stop typing for 9 seconds | "hello?" |

### How the overlay behaves

- **Overhead:** the clip floats above the head of whoever it's about (you for things you do or that happen to you, the bot for things it does), with a small pointer aimed at the head. It follows them as they walk, jump or get launched, and is kept on-screen and out from under the typing prompt.
- **Relative size:** clip height is a share of the screen, bigger for bigger moments: **a typed phrase's own meme is the largest**, then big moments (KO, power-up), notable ones, and passing ambient reactions the smallest. Phones get the same grading from a blend of screen height and width. Sizes are capped between about 70 and 270 px.
- **Captions** ("SKILL ISSUE", "BONK", or the catchphrase itself) are stamped on the clip.
- **Sound:** every clip plays with its original audio at your **Meme Volume**, and the background music dips while it speaks.
- **Priority:** a bigger moment can replace a smaller clip; a KO or power-up can replace another big one after 1.5 s.
- **Frequency:** Off / Rare / Normal / Chaos in the menu. Big moments always get their clip; smaller reactions respect a cooldown (7 s on Normal).

### The clips

The 92 clips come from a public Google Drive folder. `npm run fetch:memes` downloads them, **crops off black bars** (many are portrait videos inside widescreen frames), shrinks them to 360p, trims them to 6 seconds, writes a thumbnail for the queue panel, and records everything in `assets/memes/manifest.json`. The result is about 13 MB. The original downloads are cached in your OS temp folder, never in the project.

---

## The bot and the three difficulty levels

Pick a level on the start screen (**1 / 2 / 3**) or switch any time in the menu. It's remembered between visits and shown next to the foe's name.

| | **Easy**: Keyboard Warrior | **Medium**: Mind Reader | **Hard**: Omniscient |
| :--- | :---: | :---: | :---: |
| Bot health | 120% | 170% | 220% |
| Damage per hit | 8 | 9 | 12 |
| Warning before it hits | 0.20 s | 0.14 s | 0.10 s |
| Time between attacks | 1.6-2.8 s | 1.1-2 s | 0.7-1.3 s |
| Ultra | every 13-21 s | every 9-15 s | every 6-11 s, short warning |
| Blocks your plain strikes | 28% | 38% | 50% (more in a long combo) |
| Reads your air launcher | 55% | 70% | 85% |
| Counter-pokes your dash | 65% | 80% | 95% |
| Sidesteps your strikes | 12% (+ reads long strings) | 30% | 50% |
| Dodge cooldown | 1.6 s | 0.8 s | 0.45 s |
| Hits back right after a dodge | 15% | 40% | 70% |
| Sees your special coming and evades it | 10% | 35% | 60% |
| Double swings | 35% | 45% | 60% |
| Score multiplier | 1.2x | 2x | 3x |

The old Final Boss is now **Easy**. Medium and Hard predict your rhythm (the longer your string, the likelier a sidestep), slip beams and meteors by dashing clear during the charge, hop your thrown memes, and punish the opening a dodge creates.

Every number lives in one table: `src/combat/difficulty.js`.

### The bot's moveset, and how to beat each move

Every attack is **telegraphed** by a wind-up pose and, for the dangerous ones, floating text:

| Attack | Warning | Damage (× level) | Counter |
| :--- | :--- | :---: | :--- |
| **Jab** | very short wind-up | 0.7× | guard it, or out-type it |
| **Punch** | wind-up pose | 1× | guard (blocks 70%) or Tab-dodge |
| **Heavy** ("HEAVY!") | long wind-up | 1.8×, big knockback | a guard only halves it, so Tab away |
| **Sweep** ("JUMP!") | wind-up, low kick | 1.1× | **jump** (↑): it passes completely under you |
| **Ultra** (red ring on the floor, red tint, "DODGE!") | ~1 s, ring spreads | 3.2×, unblockable | **Tab-dodge it, time a jump, or hit the bot to interrupt it** |

On Hard an ultra does about 26 damage, a quarter of your health, and nothing blocks it. Landing a strike during its wind-up cancels it ("INTERRUPTED!").

### The bot's mind-games (Medium and Hard)

- **It blocks.** When your plain strikes land, it sometimes throws up a guard ("BLOCKED"). The chance grows the longer your combo runs, so a flawless string gets harder to keep going. Finishers and special moves break through.
- **It reads your air launcher** and steps out of it ("READ YOU").
- **It counter-pokes your dash** when you close the gap from range.
- **It counters typos.** Hard always retaliates; Medium about half the time.
- **It presses when you're hurt.** On Hard it attacks faster once you're below 35% health.
- **It gets tougher.** Each knockout adds 15 health and a little damage to the next bot.

---

## Power forms, rank and score

### Style rank

Hits, finishers and specials fill a style meter and raise your rank: **D, C, B, A, S, SS, SSS**. The meter decays when you stop fighting, and a typo knocks it back, so rank is something you have to keep earning. A higher rank multiplies the score you earn per hit.

### Power forms

Your rank powers up the fighter, with glowing hair, a flame aura and effects (or pick a form yourself in the menu):

| Rank | Form | Look | Damage |
| :--- | :--- | :--- | :---: |
| D to B | **Base** | white cap | 1× |
| A, S | **Golden Rage** | spiky gold hair, flame aura, rising embers | 1.4× |
| SS | **Blue Surge** | blue hair, blue aura, crackling lightning | 1.8× |
| SSS | **Silver Instinct** | silver hair, white aura, lightning, afterimage trail | 2.4× |

Powering up triggers a charge pose, a ground shockwave, flying debris, a screen flash and a callout, and the shockwave shoves the bot back. Forms drop again once your rank falls and stays down for a moment. **Rage** (Caps Lock or `) gives 1.6× damage for 7 seconds and forces at least Golden Rage.

### Score

Each strike scores 80 (light), 150 (heavy) or 300 (crit), multiplied by your rank (+50% per rank step), doubled in Rage, and scaled by the difficulty multiplier. Specials, perfect dodges and knockouts add bonuses. The score is the gold number at the bottom left, next to your good / miss / accuracy / time.

---

## Arenas, effects and audio

### Ten arenas

All backgrounds are original art painted by code (`npm run generate:arenas`), and each keeps its floor at the same height so the fighters always stand on the ground:

| Arena | Weather | Music |
| :--- | :--- | :--- |
| **Rocky Wasteland** (default) | blowing dust | boss heavy |
| **Sunset Dojo** | falling petals | calm dojo |
| **Neon Rooftop** | rain | boss battle |
| **Volcano Pit** | rising embers | boss heavy |
| **Orbital Platform** | twinkling stars | boss battle |
| **Rolling Meadow** | floating pollen | calm dojo |
| **The Desk** | dust motes | street combat |
| **Retro CRT Grid** | none | street combat |
| **Sketchpad** | none | street combat |
| **Green Screen** | none | street combat |

The **Green Screen** is a pure `#00ff00` backdrop for recording clips and chroma keying.

### The fighters

The stick figures are **drawn live from a skeleton** (head, torso, two-segment arms and legs) and cut out of ruled, crumpled notebook paper, so limbs really move: guard, walk cycle, jabs, cross, kick, uppercut, dive slam, hurt, knock-down, dash, charge, beam and guard-shield poses. The lowest point of every pose is pinned to the ground, so feet never float. Hits make you lunge into range, the bot flashes and slides back, and air launches pop it up while you float alongside to keep the juggle going.

### Effects

Hit sparks, shockwave rings, ground craters, dust, speed lines, afterimages, screen shake, punch zoom, hit-stop, knockout slow motion, floating combat text ("CRIT!", "BLOCKED", "PERFECT DODGE!", "K.O.!"), per-arena weather, and a red vignette in Rage. All are generated in code; there are no image files for them.

### Audio

Mechanical-keyboard thocks, combat hits, whooshes and fanfares, plus a music track per arena. Meme clips bring their own audio. Keyboard and combat volume and music volume are sliders in the menu.

---

## Menu and settings

Press **Esc** to pause (a solo fight freezes completely; an online one keeps running). The pause menu has four tabs, **Fight**, **Arena**, **Moves** and **Settings**:

| Section | What you can set |
| :--- | :--- |
| **Bot difficulty** | Easy / Medium / Hard (applies immediately; the current bot is rescaled in place) |
| **Arena** | Any of the ten, with thumbnails |
| **Power form** | Auto (by rank), Base, Golden Rage, Blue Surge or Silver Instinct |
| **How attacks work** | A built-in guide to every move, control and bot attack |
| **Meme reactions** | Off / Rare / Normal / Chaos, a "preview one" button, and Meme Volume |
| **Graphics** | Auto, High or Low (see [Performance](#performance)) |
| **Custom prompt** | Type any phrase to fight with, or use a preset. It replaces one queue slot, then the queue resumes. |
| **Audio** | Keyboard / combat sound and music volume |

Your difficulty, meme frequency, meme volume and graphics choice are saved in your browser's local storage (`memeDuel.difficulty`, `memeDuel.memes`, `memeDuel.graphics`), so they survive a refresh. Nothing is sent anywhere.

---

## Performance

The goal is a game that starts fast and never stutters, even on a modest laptop or a phone.

- **Adaptive graphics.** In **Auto** the game watches its real frame rate. If it drops under ~40 fps it lowers the render resolution, particle count, glow, lightning and afterimages one step at a time, and raises them again when it has headroom. **High** and **Low** pin it. Phones start one step down.
- **Cheaper drawing.** Antialiasing is skipped on high-DPI screens (the pixel ratio already smooths edges), the render resolution is capped at 1.5×, and fighters that are standing still redraw less often on slower devices.
- **No waiting on memes.** The clip for the phrase you're typing and the next two are prefetched, the rest trickle in quietly while you play, and prefetching is skipped on data-saver connections.
- **Fast first load.** All game modules are fetched in parallel (`modulepreload`), fonts don't block the first paint, text is Brotli-compressed by the host, and media is cached for a week. A first visit transfers about 1 MB before the clips, and the game is interactive in under a second on a fast connection.

---

## Hosting on Vercel

The game is static files, so any static host works. It's currently on Vercel at https://meme-duel-seven.vercel.app.

```bash
npm run build:web                         # writes web-dist/ (about 27 MB)
cd web-dist
vercel link --project meme-duel --yes     # first time only; the link survives rebuilds
vercel deploy --prod --yes
```

`npm run build:web`:

- copies only the files the game actually references (the page, `src/`, three.js and its core, the arenas, the audio it uses and the meme clips), so tests, source packs and design assets stay out;
- writes `web-dist/vercel.json` with caching rules: **media is cached for a week, code always revalidates, and `assets/memes/manifest.json` always revalidates** (so memes, phrases or moves you edit reach returning players immediately);
- preserves `web-dist/.vercel` so you don't have to relink.

Preview the hosted build locally with `ROOT=web-dist PORT=3100 npm run serve`.

---

## Customising the game

### Add, remove or retag memes

1. Edit `scripts/memes_drive_list.txt` (one line per clip: `driveFileId|file name.mp4`). The clips must be shared so "anyone with the link" can view them.
2. In `scripts/fetch_memes.js`, set the clip's typeable line in `PHRASES` (letters, digits and spaces only), its special move in `MOVES` (`beam`, `slam`, `flurry`, `timeskip` or `powerup`), and which reactions it can serve in `TAG_RULES`.
3. Run `npm run fetch:memes`. Use `npm run fetch:memes -- --retag` to rebuild only the manifest and thumbnails, or `-- --recompress` to redo every clip from the cached originals.

A clip with no phrase is never typed, but can still play as a reaction. A clip with no tag only plays as a random "misc" reaction.

### Change how hard the bot is

Edit the table in `src/combat/difficulty.js`. Every level is one block of numbers (health, damage, telegraph time, attack weights, ultra timing, block / read / poke chances, double strikes, dodge, mercy, regen, score). The shared attack definitions (`ATTACKS`) are at the top of the same file.

### Tune the meme overlay

At the top of `src/ui/memeReactions.js`: `SIZE` (how big each kind of moment is, as a share of the screen), `MIN_CLIP_PX` / `MAX_CLIP_PX`, `HUD_TOP_PX` (the strip kept clear for the prompt), `FREQUENCY` (cooldowns and chances) and `CAPTIONS`.

### Add or change an arena

Add a scene function in `scripts/generate_arenas.js` (keep the floor at 62% of the image height), run `npm run generate:arenas`, and add a line to `ARENAS` in `src/render/arenas/arenaManager.js` with its name, file, weather and (optionally) its music in `src/core/app.js`.

### Change the starting phrases

If the memes can't load, the game falls back to the short phrase list in `src/combat/promptManager.js`.

---

## Project structure

```
index.html              the landing page; the game loads when you press Play
styles.css              all styling: HUD, menu, start screen, meme overlay
server.js               tiny static server (ROOT / PORT env vars)
src/
  core/
    app.js              wires everything together and runs the game loop
    inputManager.js     keyboard: typing, specials, walk / jump / guard
    audioSystem.js      sound effects and music
    perfMonitor.js      adaptive graphics quality
  combat/
    promptManager.js    the meme queue, current phrase, word and sentence events
    comboEngine.js      strikes, rank, forms, rage, the five special moves
    fightDirector.js    the bot: attack choice, telegraphs, counters, spacing, respawn
    difficulty.js       the three levels and the bot's attack table
    match.js            rounds, the clock, FINISH HIM and fatalities
    secrets.js          the hidden arrow-key moves
  render/
    arenas/arenaManager.js     backdrops, camera, shake, world-to-screen
    stickman/stickmanRig.js    the skeleton, poses and paper-cutout drawing
    stickman/paperStandee.js   a fighter: physics, knockback, animation state
    effects/effectsManager.js  auras, beam, sparks, rings, afterimages, weather
  net/
    netSession.js       PeerJS: quick match slots, room codes, ping
    versus.js           online rules: puppet fighter, hit events, round sync
  landing/
    landing.js / .css   the landing page, how-to and meme gallery
  ui/
    onlineLobby.js      quick match / create room / join room
    memeReactions.js    the overhead meme overlay, clip choice, prefetching
    memeComboMenu.js    the Esc menu
    modeSelect.js       the start-screen difficulty picker
    retroHud.js         prompt, queue panel, health bars, score, rank
scripts/
  fetch_memes.js        download + crop + compress + tag the clips
  memes_drive_list.txt  the clip list (Drive IDs)
  generate_arenas.js    paints the arena backgrounds
  build_web.js          builds the hosted site into web-dist/
assets/
  memes/                clips, thumbnails and manifest.json
  arenas/               generated backgrounds
  audio/                sound effects and music
  libs/                 three.js and PeerJS (vendored, no CDN at play time)
test/
  verify_clone.js       the test suite behind `npm test`
```

`assets/` also still holds files from the project this game grew out of (old backgrounds, sprites, fonts, data and generator scripts). The game doesn't load them, the hosted build leaves them out, and `test/verify_game.js` is a leftover test for that older layout that `npm test` doesn't run.

---

## Tests

`npm test` runs 172 checks in a few seconds (it also rebuilds `web-dist/`). They cover:

- required files, the arena images (all 1920×1080) and audio assets;
- prompt logic: typing, accuracy, word and sentence events, queue order;
- **regressions for earlier bugs**: no letter key is ever bound to movement (so **A** and **D** type), every pose keeps its feet on the ground line, and the meme manifest always revalidates;
- the meme data: 91 clips, 71 typeable phrases (plain A-Z / 0-9 / space), every phrase has its hand-picked move, thumbnails exist, and the ladder order is right;
- difficulty: every setting rises (or falls) correctly from Easy to Hard, and every attack and counter exists;
- the no-freeze design: memes never pause the loop, block typing or delay a move, and the overlay is anchored to a fighter and sized relative to the screen;
- the hosted build: lean (under 40 MB), complete, with the right cache rules and modules preloaded.

They check logic, data and wiring. They can't judge how the game *feels*, so play a few rounds on each level after changing the bot or the memes.

---

## Troubleshooting

| Problem | Fix |
| :--- | :--- |
| No sound at first | Browsers block audio until you interact. Click the page or press a key. |
| No meme popups | Check **Meme reactions** isn't set to Off in the menu, and that `assets/memes/manifest.json` exists (`npm run fetch:memes` rebuilds it). |
| A meme plays muted | The browser blocked sound because you hadn't interacted yet. It plays with sound once you have. |
| Game feels laggy | Menu, **Graphics**, **Low**. On a laptop, plug it in and close other tabs. |
| `fetch:memes` fails | It needs `ffmpeg` and `ffprobe` on your PATH (`brew install ffmpeg`), and the Drive folder must still be shared. Failed clips are listed at the end. |
| Letters don't type | Make sure the menu (Esc) or the start screen isn't open; they capture the keyboard. |
| After redeploying, old memes show | Hard-refresh once. The manifest now always revalidates, so this only affects browsers that cached it before the fix. |
| Want to reset settings | Clear the site's local storage (the three `memeDuel.*` keys). |

---

## Credits and legal

- **Code, fighters, arenas, effects, bot and meme system:** made for this project. The game began from an open-source typing-fighter clone and has been rewritten around the animated paper fighters, the meme queue, the bot and the hosting setup.
- **Meme clips:** third-party video clips from a Google Drive folder supplied by the project owner. They are not original to this project and may be copyrighted by their creators; some contain strong language. Check you're comfortable (and entitled) to host or share them before publishing the game publicly.
- **Fonts** are loaded from Google Fonts. **three.js** is MIT-licensed.
- **License:** MIT for the game code (see `package.json`).
