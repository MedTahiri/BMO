import {
  Armchair, BatteryFull, DoorOpen, Footprints, Frown, Gamepad2, Hand, MessageCircle, Smile, Sparkles,
  type LucideIcon,
} from 'lucide-react'
import type { ClipName } from '../state/bmoStore'

export const HERO = {
  kicker: 'Adventure Time · Tree Fort resident',
  title: "Who's BMO?",
  text:
    'A little living video game console who shares the Tree Fort with Finn and Jake. Part console, part roommate, ' +
    'part best friend, and the most cheerful box of circuits in the Land of Ooo.',
  cta: 'Say hi! Click BMO',
}

export const MEET = {
  title: 'Meet BMO',
  paragraphs: [
    'BMO is a small robot and video game console who lives with Finn and Jake. Under that teal shell sit the features of a ' +
      'whole household: a portable outlet, music player, camera, alarm clock, flashlight, strobe light and video player.',
    'BMO was built by the inventor Moseph "Moe" Mastro Giovanni as part of the MO line of robots. Moe designed BMO to ' +
      'understand fun so BMO could help raise a child. He never had children, so he sent BMO out to find another family.',
    'BMO has no fixed gender. Characters, BMO included, use he, she and plenty of nicknames like "m\'lady" and ' +
      '"little living boy". In the original series BMO is voiced by Niki Yang.',
  ],
  stats: [
    { k: 'Voice', v: 'Niki Yang' },
    { k: 'Creator', v: 'Moe Mastro Giovanni' },
    { k: 'Home', v: 'The Tree Fort' },
    { k: 'Best buds', v: 'Finn & Jake' },
  ],
}

export const FACE = {
  title: 'Face & feelings',
  text:
    "BMO's screen is their face, and it is very expressive. Pick a mood below, or press the real buttons on BMO's " +
    'body: the D-pad looks around, red laughs, green blinks, the triangle gasps, the blue dot powers the screen and the dashes start a chat.',
}

export const ANATOMY = {
  title: 'Under the faceplate',
  steps: [
    { at: 0, title: 'Four screws and a hinge', text: 'The faceplate swings open on its left edge, and the green PCB comes with it.' },
    { at: 0.32, title: 'A whole world inside', text: 'Hover the pins to meet the parts that keep BMO going.' },
    { at: 0.58, title: 'Exploded view', text: 'Faceplate, PCB, screws and screen fly apart. Keep scrolling to see it all.' },
  ],
}

export interface Hotspot {
  id: string
  node: string
  title: string
  text: string
  show: 'open' | 'explode' | 'any'
}

export const HOTSPOTS: Hotspot[] = [
  { id: 'screen', node: 'BMO_ScreenModule', title: 'LCD screen', show: 'any',
    text: "BMO's face. A pixel-grid LCD that shows expressions, games and messages." },
  { id: 'drive', node: 'Int_MustardStep1', title: 'Cartridge drive', show: 'open',
    text: 'Lines up with the slot on the faceplate. Slide a game cartridge in and BMO is ready to play.' },
  { id: 'heart', node: 'Int_Heart', title: "BMO's heart", show: 'open',
    text: 'A puffy golden heart with a sleepy face and a medal. It beats while BMO is on.' },
  { id: 'power', node: 'Int_PowerBlock', title: 'Power block', show: 'open',
    text: 'Outlets and sockets. BMO really can work as a portable electrical outlet.' },
  { id: 'tubes', node: 'Int_Tube_A.1', title: 'Rainbow tubes', show: 'open',
    text: 'Chunky green, pink and blue lines carrying power and fun around the case.' },
  { id: 'pcb', node: 'BMO_PCB', title: 'Button PCB', show: 'explode',
    text: 'Contact pads under every button, plus chips, pin headers and gold traces.' },
  { id: 'screws', node: 'Screw_Front.1', title: 'Corner screws', show: 'explode',
    text: 'Four threaded screws hold the faceplate to the posts in each corner.' },
]

export const POWER = {
  title: 'Batteries included',
  text:
    "On BMO's back, under the vents, sits a battery bay with two AA cells. The door is hinged at the bottom and drops down like a little ramp.",
}

export const PLAY = {
  title: 'BMO Arcade',
  text:
    "BMO is a games console first. These three games are named after games BMO plays in the show, and they run right " +
    "on BMO's screen. Play them with BMO's own buttons: click them, or use your keyboard.",
}

export const GAMES_INFO = [
  { title: 'Guardians of Sunshine', text: 'The season 2 side-scroller. Beat Bouncy Bee, Hunny Bunny and Sleepy Sam. Attack mid-jump for a COMBO.' },
  { title: 'Lumpy Space Invaders', text: 'Lumpy invaders march down from space. Shoot them before they land. Oh my glob.' },
  { title: 'Bug Battle', text: 'Bugs pop out of nine holes. Squash them before they get away. Gold bugs are worth 50.' },
]

export const TV = {
  title: 'BMO TV',
  text:
    "BMO is also a video player. Watch official Adventure Time clips from Cartoon Network, or load one of your own videos. " +
    "It plays on BMO's screen and never leaves your computer. BMO's buttons are the remote.",
}

/** Official Cartoon Network uploads (verified embeddable via YouTube oEmbed). */
export const TV_CHANNELS = [
  { id: '5BbcPJibZiA', title: 'BMO Saves the Galaxy' },
  { id: 'UqRvCEnCKXo', title: 'Best of BMO' },
  { id: 'yKI0itG8bCo', title: "BMO and Bubble's Forest Mystery" },
  { id: 'XTuUoeNNrB8', title: 'BMO The Hero (Distant Lands)' },
]

export const MOVES: { clip: ClipName; label: string; icon: LucideIcon; text: string }[] = [
  { clip: 'Idle', label: 'Idle', icon: Smile, text: 'Breathing, blinking, glancing around.' },
  { clip: 'Wave', label: 'Wave', icon: Hand, text: 'A big happy hello.' },
  { clip: 'Walk', label: 'Walk', icon: Footprints, text: 'Little noodle legs on the move.' },
  { clip: 'Talk', label: 'Talk', icon: MessageCircle, text: 'Chatting with gestures.' },
  { clip: 'OpenLid', label: 'Open up', icon: DoorOpen, text: 'Swing the faceplate open.' },
  { clip: 'BatteryDoor', label: 'Batteries', icon: BatteryFull, text: 'Check the AA cells.' },
  { clip: 'Explode', label: 'Explode', icon: Sparkles, text: 'Every part floats apart.' },
  { clip: 'PlayGame', label: 'Play game', icon: Gamepad2, text: 'Cartridge in, game on.' },
  { clip: 'Sit', label: 'Sit', icon: Armchair, text: 'Plop down like the toy figure.' },
  { clip: 'Sad', label: 'Sad', icon: Frown, text: 'A long, droopy sigh.' },
]

export const FACTS = {
  title: 'Fun facts & episodes',
  items: [
    { title: 'Football', text: 'In "Five Short Graybles" BMO is seen chatting with a mirror version of themself called Football.' },
    { title: 'BMO Noire', text: 'BMO turns detective in a black-and-white noir mystery around the house.' },
    { title: 'Be More', text: 'BMO makes a trip to the MO factory where BMO was made.' },
    { title: 'BMO Lost', text: 'BMO is swept far from the Tree Fort and has to find the way home.' },
    { title: 'Distant Lands: BMO', text: 'BMO stars in the first Adventure Time: Distant Lands special, set in outer space.' },
    { title: 'Accent', text: 'BMO speaks English with a Korean accent, courtesy of voice actor Niki Yang.' },
  ],
  credit:
    'Fan-made 3D model, procedurally built in Blender. Adventure Time and BMO are trademarks of Cartoon Network. This is an unofficial fan page.',
}

/**
 * About the author: shown in the page footer. Fill in your details; leave a link empty ('') to hide it.
 */
export const AUTHOR = {
  name: 'Mohamed Tahiri',
  role: 'Software Engineer',
  bio:
    'I built this BMO using Claude Code: the model was generated, rigged and animated in Blender with Python, ' +
    'then brought to the web with React and three.js.',
  avatar: `${import.meta.env.BASE_URL}me.jpg`, // file in web/public; empty = initials
  links: {
    github: 'https://github.com/MedTahiri',
    linkedin: 'https://www.linkedin.com/in/mohamed-tahiri-112239222/',
    website: '',
    email: '',
  },
}

/** Copyright & credits (footer). */
export const LEGAL = {
  disclaimer:
    'Adventure Time, BMO and all related characters and elements are trademarks of and © Cartoon Network. ' +
    'This is a non-commercial fan project. It is not affiliated with, sponsored or endorsed by Cartoon Network ' +
    'or Warner Bros. Discovery.',
  credits: [
    'Adventure Time created by Pendleton Ward. BMO is voiced by Niki Yang in the original series.',
    'Video clips: official Cartoon Network uploads, embedded from YouTube.',
    '3D model, rig, animations, games and website: original fan work by Mohamed Tahiri, made with Claude Code.',
    'Sound effects: original synthesized audio (no audio from the show).',
  ],
  /** Add one line per audio file you put in public/sounds that comes from somewhere else. */
  soundCredits: [
    'BMO voice lines: AI text-to-speech generated on fish.audio. Not audio from the show.',
  ] as string[],
  takedown: 'Rights holder and want something removed? Contact me on GitHub and it will be taken down.',
}
