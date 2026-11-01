// Meme clip fetcher.
// Downloads the meme clips listed in scripts/memes_drive_list.txt (a public Google Drive
// folder), shrinks them for in-game popups, and writes assets/memes/manifest.json with the
// fight situations each clip suits.
//
//   node scripts/fetch_memes.js            # download + compress + tag (skips finished files)
//   node scripts/fetch_memes.js --retag    # only rebuild manifest.json from existing clips
//
// Originals are cached under the OS temp dir, not in the project. Compression needs ffmpeg;
// without it the originals are copied as-is (much bigger).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const LIST = path.join(__dirname, 'memes_drive_list.txt');
const WEB_FIRST = 101; // web clips are numbered meme_101 upward so they never collide with the Drive clips
const WEB_LIST = path.join(__dirname, 'memes_web_list.txt'); // youtubeId|title|PHRASE|move|tags (downloaded with yt-dlp)
const OUT = path.join(ROOT, 'assets', 'memes');
const CACHE = path.join(os.tmpdir(), 'meme-duel-cache');
const MAX_SECONDS = 6;
const WEB_ONLY = process.argv.includes('--web-only'); // add the web clips, keep every existing manifest entry untouched
const RETAG_ONLY = process.argv.includes('--retag');
const RECOMPRESS = process.argv.includes('--recompress'); // redo every clip from the cached originals

// Which fight moments each clip suits, matched on the (lowercased, de-underscored) clip title.
// Clips matching nothing here still play as random "misc" reactions.
const TAG_RULES = {
  intro:    /purple canyon|youtube intro/,
  enter:    /ayo come look|abbu aa rahe|kya haal hai|kaise kaise log|hamare yaha|kon bhonk|aaiye dekhte|abhi maza|arey band kar|ishow speed|hindustani bhau robert/,
  timeskip: /2000 years|few moments later|infinity later|aaj mood|aaj ke liye filhal|tension nahi/,
  idle:     /aaj mood|aaj ke liye|tension nahi|ab bol na|kaam kar|parhai likhai|chalo meme|abey jaldi bol/,
  laugh:    /laugh|ahhh|ha wah|chi chi|clapping|smiling|funny|comedy|mazak|animal meme|50 ruppee|overacting/,
  praise:   /shabash|sabas|bahut badhiya|clapping|chi chi|raja ji|sakht launda|bada sakht|kya baat|gandhi|nice/,
  hype:     /aukat|game bajana|ab dekh tu|abhi batata|tapa tap|asambhav|lekin 1second|lekin ye sala|teri dada|raja ji|sakht launda|bada sakht/,
  powerup:  /raja ji|shaktiyo|asambhav|sakht launda|bada sakht|lekin 1second|ab dekh tu|gandhi|aise mai/,
  beam:     /asambhav|maut ko|tapa tap|abhi batata|game bajana|teri dada|saanp ko|ruk tere/,
  slam:     /khopdi|tera baap yahan|mujhe maro|dimag kharab|saanp ko|pichwade|baap ko bhej|baap ki chaddi|aukat|teri dada/,
  ko:       /laugh|ahhh|ha wah|chi chi|clapping|bas hawa|ab dekh tu|maut ko|khopdi|kab ho gaya|lekin ye sala|50 ruppee/,
  hurt:     /mere sath|raha nhi jata|dil se bura|hey bhagwan|gadbad|are baba|arey mai kya karu|aee ohh|mujhe maro|arey deva|bas hawa|cid /,
  typo:     /sorry babu|kab ho gaya|comedy me|kehna kya|kya baat kar|mazak|tu samjha|parhai|haan ye karlo|mat sikha|neech aadmi|aabey saale|baman ladki/,
  dodge:    /cheating|jhoot|jhooth|chal jhoota|chutiya banaya|mai nahi bataunga|abey jaldi|aabey saale/,
  launch:   /ayo come|chi chi|aee ohh|kab ho gaya|animal/,
  rage:     /dimag kharab|aukat|abey laude|tera baap|teri dada|mujhe maro|saanp ko|khopdi|baap ko bhej/
};

// The line you type for each meme (first match wins). Only clips with a spoken catchphrase
// that is fun to type are listed; everything else still plays as a reaction clip.
// Letters, digits and spaces only, so every phrase can be typed on a plain keyboard.
const PHRASES = [
  [/abhi maza aayega na bhidu/, 'ABHI MAZA AAYEGA NA BHIDU'],
  [/aaiye dekhte hai maza/, 'AAIYE DEKHTE HAI MAZA AAYEGA'],
  [/shabash beta/, 'SHABASH BETA BAHUT BADHIYA'],
  [/sabas sabash/, 'SHABASH SHABASH'],
  [/2000 years later/, '2000 YEARS LATER'],
  [/few moments later/, 'A FEW MOMENTS LATER'],
  [/infinity later/, 'ONE ETERNITY LATER'],
  [/sorry babu/, 'I AM SORRY BABU'],
  [/kab ho gaya/, 'KAB HO GAYA YE'],
  [/comedy me/, 'ARE YOU COMEDY ME'],
  [/tera toh game bajana/, 'TERA TOH GAME BAJANA PADEGA'],
  [/aukat me raho/, 'AUKAT ME RAHO'],
  [/asambhav asambhav/, 'ASAMBHAV ASAMBHAV'],
  [/raja ji apni shaktiyo/, 'APNI SHAKTIYO KA ISTEMAAL KARO'],
  [/sakht launda yahan/, 'SAKHT LAUNDA PIGHAL GAYA'],
  [/aise mai bada sakht/, 'AISE MAI BADA SAKHT LAUNDA HU'],
  [/kya baat kar raha/, 'KYA BAAT KAR RAHA HAI'],
  [/cheating karta hai/, 'CHEATING KARTA HAI TU'],
  [/jhooth bol raha/, 'JHOOTH BOL RAHA HAI'],
  [/jhoot bolo/, 'JHOOT BOLO'],
  [/mai nahi bataunga/, 'MAI NAHI BATAUNGA'],
  [/mere sath aanyay/, 'MERE SATH ANYAY HUA HAI'],
  [/tension nahi lene/, 'TENSION NAHI LENE KA'],
  [/aaj mood nhi dhruv|aaj mood nahi karraha/, 'AAJ MOOD NAHI HAI'],
  [/are baba meme/, 'ARE BABA'],
  [/kuch to gadbad he daya|cid +kuchh/, 'KUCH TO GADBAD HAI DAYA'],
  [/arey deva ye gadbad/, 'ARE DEVA YE GADBAD HAI'],
  [/bas hawa nikal/, 'BAS HAWA NIKAL GAYI'],
  [/dil se bura lagta/, 'DIL SE BURA LAGTA HAI'],
  [/hey bhagwan/, 'HEY BHAGWAN'],
  [/kesa laga mera mazak/, 'KESA LAGA MERA MAZAK'],
  [/tu samjha nai/, 'TU SAMJHA NAHI'],
  [/emotional damage/, 'EMOTIONAL DAMAGE'],
  [/chal jhoota/, 'CHAL JHOOTA'],
  [/ab dekh tu/, 'AB DEKH TU AB TU GAYA BETA'],
  [/abbu aa rahe/, 'ABBU AA RAHE HAI'],
  [/kya haal hai/, 'KYA HAAL HAI'],
  [/lekin 1second/, 'LEKIN ONE SECOND'],
  [/parhai likhai/, 'PARHAI LIKHAI KARO'],
  [/abey jaldi bol/, 'ABEY JALDI BOL'],
  [/raha nhi jata/, 'RAHA NAHI JATA'],
  [/hamare yaha aisa/, 'HAMARE YAHA AISA HI HOTA HAI'],
  [/kaise kaise log/, 'KAISE KAISE LOG RAHTE HAI'],
  [/aaj ke liye filhal/, 'AAJ KE LIYE FILHAL ITNA HI'],
  [/maut ko chhu/, 'MAUT KO CHHU KE'],
  [/arey band kar/, 'ARE BAND KAR'],
  [/teri dada giri/, 'TERI DADAGIRI NIKAL DUNGA'],
  [/khopdi tor/, 'KHOPDI TOR SALAY KA'],
  [/saanp ko dekha/, 'SAANP KO DEKHA'],
  [/abhi batata hu/, 'ABHI BATATA HU'],
  [/ayo come look/, 'AYO COME LOOK AT THIS'],
  [/ab bol na/, 'AB BOL NA'],
  [/kon bhonk raha/, 'KON BHONK RAHA HAI'],
  [/tapa tap/, 'TAPA TAP'],
  [/tera baap yahan/, 'TERA BAAP YAHAN CHHOD GAYA THA'],
  [/mahatma gandhi/, 'JIS RAH PE TUM CHAL RAHE HO'],
  [/ha malum hai/, 'HA MALUM HAI'],
  [/haan ye karlo/, 'HAAN YE KARLO PEHLE'],
  [/bhai bahut neech/, 'BHAI BAHUT NEECH AADMI HAI TU'],
  [/dimag kharab/, 'DIMAG KHARAB HO JAYEGA'],
  [/mujhe maro/, 'MUJHE MARO'],
  [/50 ruppee/, '50 RUPEE KAT OVERACTING KE'],
  [/areh kehna kya/, 'AREH KEHNA KYA CHAHTE HO'],
  [/arey mai kya karu/, 'AREY MAI KYA KARU'],
  [/lekin ye sala/, 'LEKIN YE KAR KYA RAHA HAI'],
  [/aee ohh/, 'AEE OHH'],
  [/chalo meme/, 'CHALO'],
  [/chi chi wow/, 'CHI CHI WOW NICE'],
  [/^clapping/, 'CLAP CLAP CLAP'],
  [/lion laughing/, 'LION LAUGHING'],
  [/purple canyon/, 'MEME DUEL BEGINS']
];

// The special move each catchphrase unleashes, chosen by what the line MEANS so the move
// matches the meme:
//   beam     threats, big finishing lines            -> a huge energy blast
//   slam     violence, accusations, "you're done"    -> launch them up and spike them down
//   flurry   mockery, laughing, cheering, impatience -> ten rapid-fire strikes
//   timeskip time cards, "later", "not today"        -> darkness, title card, delayed damage
//   powerup  pity, courage, "full power", comebacks  -> next power form plus healing
const MOVES = {
  'ASAMBHAV ASAMBHAV': 'beam',
  'MAUT KO CHHU KE': 'beam',
  'TAPA TAP': 'beam',
  'ABHI BATATA HU': 'beam',
  'TERA TOH GAME BAJANA PADEGA': 'beam',
  'TERI DADAGIRI NIKAL DUNGA': 'beam',
  'DIMAG KHARAB HO JAYEGA': 'beam',
  'AUKAT ME RAHO': 'beam',

  'KHOPDI TOR SALAY KA': 'slam',
  'TERA BAAP YAHAN CHHOD GAYA THA': 'slam',
  'MUJHE MARO': 'slam',
  'SAANP KO DEKHA': 'slam',
  'AB DEKH TU AB TU GAYA BETA': 'slam',
  'KON BHONK RAHA HAI': 'slam',
  'JHOOTH BOL RAHA HAI': 'slam',
  'CHAL JHOOTA': 'slam',
  'CHEATING KARTA HAI TU': 'slam',
  'JHOOT BOLO': 'slam',

  'CLAP CLAP CLAP': 'flurry',
  'LION LAUGHING': 'flurry',
  'CHI CHI WOW NICE': 'flurry',
  '50 RUPEE KAT OVERACTING KE': 'flurry',
  'KESA LAGA MERA MAZAK': 'flurry',
  'ARE YOU COMEDY ME': 'flurry',
  'KYA BAAT KAR RAHA HAI': 'flurry',
  'SHABASH BETA BAHUT BADHIYA': 'flurry',
  'SHABASH SHABASH': 'flurry',
  'HA MALUM HAI': 'flurry',
  'HAAN YE KARLO PEHLE': 'flurry',
  'TU SAMJHA NAHI': 'flurry',
  'EMOTIONAL DAMAGE': 'slam',
  'AREH KEHNA KYA CHAHTE HO': 'flurry',
  'ARE BAND KAR': 'flurry',
  'ABEY JALDI BOL': 'flurry',
  'AB BOL NA': 'flurry',
  'AAIYE DEKHTE HAI MAZA AAYEGA': 'flurry',
  'ABHI MAZA AAYEGA NA BHIDU': 'flurry',
  'KYA HAAL HAI': 'flurry',
  'LEKIN YE KAR KYA RAHA HAI': 'flurry',
  'AEE OHH': 'flurry',
  'CHALO': 'flurry',

  '2000 YEARS LATER': 'timeskip',
  'A FEW MOMENTS LATER': 'timeskip',
  'ONE ETERNITY LATER': 'timeskip',
  'AAJ KE LIYE FILHAL ITNA HI': 'timeskip',
  'AAJ MOOD NAHI HAI': 'timeskip',
  'TENSION NAHI LENE KA': 'timeskip',
  'HAMARE YAHA AISA HI HOTA HAI': 'timeskip',
  'PARHAI LIKHAI KARO': 'timeskip',

  'APNI SHAKTIYO KA ISTEMAAL KARO': 'powerup',
  'AISE MAI BADA SAKHT LAUNDA HU': 'powerup',
  'SAKHT LAUNDA PIGHAL GAYA': 'powerup',
  'JIS RAH PE TUM CHAL RAHE HO': 'powerup',
  'MERE SATH ANYAY HUA HAI': 'powerup',
  'DIL SE BURA LAGTA HAI': 'powerup',
  'HEY BHAGWAN': 'powerup',
  'ARE BABA': 'powerup',
  'ARE DEVA YE GADBAD HAI': 'powerup',
  'KUCH TO GADBAD HAI DAYA': 'powerup',
  'I AM SORRY BABU': 'powerup',
  'KAB HO GAYA YE': 'powerup',
  'AREY MAI KYA KARU': 'powerup',
  'ABBU AA RAHE HAI': 'powerup',
  'LEKIN ONE SECOND': 'powerup',
  'AYO COME LOOK AT THIS': 'powerup',
  'KAISE KAISE LOG RAHTE HAI': 'powerup',
  'BHAI BAHUT NEECH AADMI HAI TU': 'powerup',
  'MAI NAHI BATAUNGA': 'powerup',
  'BAS HAWA NIKAL GAYI': 'powerup',
  'RAHA NAHI JATA': 'powerup',
  'MEME DUEL BEGINS': 'powerup'
};

// The special move a finished phrase unleashes, picked from the meme's situation tags.
function moveFor(tags, index) {
  if (tags.includes('beam')) return 'beam';
  if (tags.includes('timeskip')) return 'timeskip';
  if (tags.includes('powerup')) return 'powerup';
  if (tags.includes('slam')) return 'slam';
  if (tags.includes('hype')) return 'beam';
  if (tags.includes('rage')) return 'slam';
  if (tags.includes('laugh') || tags.includes('praise')) return 'flurry';
  // sad / apologetic / misc memes: spread across moves so the queue stays varied
  return ['flurry', 'slam', 'powerup'][index % 3];
}

function phraseFor(name) {
  const key = name.toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  const hit = PHRASES.find(([re]) => re.test(key));
  return hit ? hit[1] : null;
}

function makeThumb(videoFile, thumbFile, duration) {
  if (fs.existsSync(thumbFile) && fs.statSync(thumbFile).size > 200) return true;
  const at = Math.min(0.8, Math.max(0, (duration || 1) / 3));
  const r = spawnSync('ffmpeg', [
    '-v', 'error', '-y', '-ss', String(at), '-i', videoFile, '-frames:v', '1',
    '-vf', 'scale=96:54:force_original_aspect_ratio=decrease,pad=96:54:(ow-iw)/2:(oh-ih)/2:black',
    '-q:v', '5', thumbFile
  ]);
  return r.status === 0 && fs.existsSync(thumbFile);
}

function parseList() {
  const drive = parseDriveList();
  const web = fs.existsSync(WEB_LIST)
    ? fs
        .readFileSync(WEB_LIST, 'utf8')
        .split('\n')
        .filter((l) => l.trim() && !l.startsWith('#'))
        .map((line, i) => {
          const [id, name, phrase, move, tags] = line.split('|').map((x) => x.trim());
          const n = WEB_FIRST + i;
          return { id, yt: true, name, phrase, move, tags: tags ? tags.split(',') : null, file: `meme_${String(n).padStart(3, '0')}.mp4` };
        })
    : [];
  return [...drive, ...web];
}

function parseDriveList() {
  return fs
    .readFileSync(LIST, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line, i) => {
      const cut = line.indexOf('|');
      const name = line.slice(cut + 1).replace(/\.mp4$/i, '').trim();
      return { id: line.slice(0, cut), name, file: `meme_${String(i + 1).padStart(3, '0')}.mp4` };
    });
}

function tagsFor(name) {
  const key = name.toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  const tags = Object.keys(TAG_RULES).filter((t) => TAG_RULES[t].test(key));
  return tags.length ? tags : ['misc'];
}

function hasFfmpeg() {
  return spawnSync('ffmpeg', ['-version']).status === 0;
}

function probeDuration(file) {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    return Math.round(parseFloat(out.toString()) * 10) / 10;
  } catch (e) {
    return null;
  }
}

async function download(item, dest) {
  if (item.yt) {
    // full video (not audio-only), small enough for an in-game popup
    const r = spawnSync(
      'yt-dlp',
      ['--no-playlist', '--no-update', '-q', '-f', 'bv*[height<=480]+ba/b[height<=480]/b', '--merge-output-format', 'mp4', '-o', dest, `https://www.youtube.com/watch?v=${item.id}`],
      { encoding: 'utf8' }
    );
    if (r.status !== 0 || !fs.existsSync(dest)) throw new Error(`yt-dlp failed: ${(r.stderr || '').trim().slice(-120)}`);
    return;
  }
  const url = `https://drive.usercontent.google.com/download?id=${item.id}&export=download&confirm=t`;
  const res = await fetch(url, { redirect: 'follow' });
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.startsWith('video/')) throw new Error(`HTTP ${res.status} (${type || 'no type'})`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

// Many source clips are portrait videos sitting inside a widescreen frame with black bars.
// Find the real picture area so the in-game overlay can be compact instead of mostly black.
function detectCrop(src) {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src], { encoding: 'utf8' });
  const [W, H] = (probe.stdout || '').trim().split(',').map(Number);
  if (!W || !H) return null;
  const r = spawnSync('ffmpeg', ['-v', 'info', '-t', '3', '-i', src, '-vf', 'cropdetect=limit=28:round=2:reset=0', '-f', 'null', '-'], { encoding: 'utf8' });
  const hit = [...(r.stderr || '').matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)].pop();
  if (!hit) return null;
  const [w, h, x, y] = hit.slice(1).map(Number);
  // only crop when it removes real bars (more than 8% of the frame) and leaves a sane picture
  if (w * h > W * H * 0.92 || w < 120 || h < 120) return null;
  return `crop=${w}:${h}:${x}:${y},`;
}

function compress(src, dest) {
  const crop = detectCrop(src) || '';
  const r = spawnSync(
    'ffmpeg',
    [
      '-y', '-v', 'error', '-i', src, '-t', String(MAX_SECONDS),
      '-vf', crop + "scale='if(gt(iw,ih),-2,360)':'if(gt(iw,ih),360,-2)'",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '80k', '-ac', '2', '-movflags', '+faststart', dest
    ],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${(r.stderr || '').trim().slice(0, 120)}`);
}

async function main() {
  const items = parseList().filter((it) => !WEB_ONLY || it.yt);
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(CACHE, { recursive: true });
  const ffmpeg = hasFfmpeg();
  if (!ffmpeg) console.warn('ffmpeg not found: copying originals uncompressed (large).');

  const failed = [];
  if (RECOMPRESS) fs.rmSync(path.join(OUT, 'thumbs'), { recursive: true, force: true }); // thumbnails must match the new crop
  if (!RETAG_ONLY) {
    const queue = [...items];
    let done = 0;
    const worker = async () => {
      while (queue.length) {
        const item = queue.shift();
        const dest = path.join(OUT, item.file);
        try {
          if (RECOMPRESS || !fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
            const raw = path.join(CACHE, `${item.id}.mp4`);
            if (!fs.existsSync(raw) || fs.statSync(raw).size < 1000) await download(item, raw);
            if (ffmpeg) compress(raw, dest);
            else fs.copyFileSync(raw, dest);
          }
        } catch (e) {
          failed.push(`${item.file} ${item.name}: ${e.message}`);
        }
        done++;
        if (done % 10 === 0 || done === items.length) console.log(`  ${done}/${items.length}`);
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  }

  const thumbDir = path.join(OUT, 'thumbs');
  fs.mkdirSync(thumbDir, { recursive: true });
  const clips = [];
  for (const item of items) {
    const file = path.join(OUT, item.file);
    if (!fs.existsSync(file)) continue;
    const duration = probeDuration(file);
    const tags = item.tags ? [...new Set([...tagsFor(item.name).filter((t) => t !== 'misc'), ...item.tags])] : tagsFor(item.name);
    const thumbName = item.file.replace(/\.mp4$/, '.jpg');
    const clip = {
      file: item.file,
      title: item.name.replace(/[_]+/g, ' '),
      duration,
      tags
    };
    const phrase = item.phrase || phraseFor(item.name);
    if (phrase) {
      clip.phrase = phrase;
      clip.move = item.move || MOVES[phrase] || moveFor(tags, clips.length);
      if (ffmpeg && makeThumb(file, path.join(thumbDir, thumbName), duration)) clip.thumb = `thumbs/${thumbName}`;
    }
    clips.push(clip);
  }
  let all = clips;
  if (WEB_ONLY) {
    const old = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8')).clips;
    const fresh = new Set(clips.map((c) => c.file));
    all = [...old.filter((c) => !fresh.has(c.file)), ...clips];
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ version: 1, clips: all }, null, 2) + '\n');

  const bytes = clips.reduce((n, c) => n + fs.statSync(path.join(OUT, c.file)).size, 0);
  const byTag = {};
  clips.forEach((c) => c.tags.forEach((t) => (byTag[t] = (byTag[t] || 0) + 1)));
  console.log(`\n${clips.length}/${items.length} clips ready, ${(bytes / 1e6).toFixed(1)} MB in assets/memes/`);
  console.log('clips per situation:', byTag);
  const queued = clips.filter((c) => c.phrase);
  const byMove = {};
  queued.forEach((c) => (byMove[c.move] = (byMove[c.move] || 0) + 1));
  console.log(`${queued.length} clips have a typeable phrase; special moves:`, byMove);
  if (failed.length) {
    console.error(`\n${failed.length} failed:\n  ` + failed.join('\n  '));
    process.exitCode = 1;
  }
}

main();
