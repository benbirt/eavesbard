import type { Scenario } from "../scenarios.js";
import { talk } from "./make.js";

/** Danger close but no fight: becoming tense, staying tense, and tension passing. */
export const TENSE_SET: Scenario[] = [
  // --- Calm becomes tense ---
  talk("tense", "noise in the crypt", ["dungeon", "calm"], [
    "we keep walking down the corridor",
    "you hear something, a scraping sound, from up ahead",
    "i stop and hold up my hand",
    "everyone freeze. i'm listening. perception is fifteen",
  ], ["dungeon"], ["tense"]),
  talk("tense", "followed through the alleys", ["town", "calm"], [
    "on your way back from the market, you notice two men",
    "they've been behind you for the last three streets",
    "i turn down an alley to see if they follow",
    "they do. and a third one steps out at the other end",
  ], ["town"], ["tense"]),
  talk("tense", "sneaking past the guards", ["interior", "calm"], [
    "okay we need to get past the guard room",
    "everyone roll stealth",
    "twelve. nine. oh no, six",
    "the guard looks up from his cards. who's there? he picks up his crossbow",
  ], ["interior"], ["tense"]),
  talk("tense", "tracks in the snow Web Speech", ["wilderness", "calm"], [
    "The snow is falling heavier now",
    "You find tracks huge ones bigger than a bear",
    "They're fresh and they lead towards the camp",
    "I draw my bow and we follow them slowly",
  ], ["wilderness"], ["tense"]),
  talk("tense", "threat in the tavern", ["tavern", "calm"], [
    "the door bangs open and five men in black cloaks walk in",
    "the room goes quiet",
    "the leader looks around and says we're looking for a half-elf with a stolen amulet",
    "i put my hand on my sword under the table",
  ], ["tavern"], ["tense"]),
  talk("tense", "a trap triggered", ["dungeon", "calm"], [
    "i step into the next room",
    "click. the door slams shut behind you and the ceiling starts to come down",
    "oh no oh no, how fast",
    "you've got three rounds. what do you do",
  ], ["dungeon"], ["tense"]),
  talk("tense", "storm at sea", ["travel", "calm"], [
    "on the third night the sky turns black",
    "the waves are getting huge, the captain is shouting orders",
    "i grab a rope and help with the sails",
    "a wave crashes over the deck, roll strength to hold on",
  ], ["travel"], ["tense"]),
  talk("tense", "standoff with bandits", ["travel", "calm"], [
    "there's a tree across the road",
    "and men with crossbows step out of the trees on both sides",
    "the leader says toll's fifty gold each, or we take the cart",
    "nobody move. i'll talk to him. how about ten each",
  ], ["travel", "wilderness"], ["tense"]),
  talk("tense", "something in the water", ["wilderness", "calm"], [
    "we're wading across the river",
    "halfway across, something big brushes against your leg",
    "what was that",
    "the water ripples, something long and dark is circling you",
  ], ["wilderness"], ["tense"]),
  talk("tense", "chase across rooftops", ["town", "calm"], [
    "the thief grabs the purse and bolts",
    "after him! i jump onto the barrels and up to the roof",
    "he's jumping from roof to roof, you're two buildings behind",
    "acrobatics to make the jump. fourteen, you make it",
  ], ["town"], ["tense"]),
  talk("tense", "hostage negotiation", ["interior", "calm"], [
    "the cult leader has a knife to the mayor's throat",
    "he says one step closer and she dies",
    "okay okay we're not moving, what do you want",
    "he wants the relic. put it on the floor and slide it over",
  ], ["interior"], ["tense"]),
  talk("tense", "eyes in the dark", ["wilderness", "calm"], [
    "it's my watch, i'm sitting by the fire",
    "you see eyes reflecting the firelight, at the edge of the trees, lots of them",
    "i wake everyone up quietly",
    "the eyes don't move, you hear a low growl",
  ], ["wilderness"], ["tense"]),
  talk("tense", "poisoned drink suspicion", ["interior", "calm"], [
    "the duke raises his glass to toast you",
    "insight check. you notice the servant who poured your wine is sweating and won't look at you",
    "i don't drink it. i swap my glass with the duke's",
    "the servant goes pale",
  ], ["interior"], ["tense"]),
  talk("tense", "the floor creaks", ["interior", "calm"], [
    "we're searching the abandoned house",
    "upstairs, the floorboards creak, but nobody's up there",
    "i go up slowly with my lantern",
    "the door at the end of the corridor slowly swings open on its own",
  ], ["interior"], ["tense"]),
  talk("tense", "ambush spotted Web Speech", ["travel", "calm"], [
    "As the road goes through the canyon",
    "Roll perception everybody",
    "Eighteen OK you see glints of metal up on the ridge someone is up there",
    "I signal the others and slow the cart down",
  ], ["travel", "wilderness"], ["tense"]),
  talk("tense", "short: something is watching", ["wilderness", "calm"], [
    "you get the feeling you're being watched",
  ], ["wilderness"], ["tense"]),
  talk("tense", "short: the dragon wakes", ["dungeon", "calm"], [
    "the pile of gold shifts and a huge eye opens",
  ], ["dungeon"], ["tense", "combat"]),
  talk("tense", "guards demand papers", ["town", "calm"], [
    "at the gate the guards stop you",
    "papers, says the sergeant, and he looks at the wanted poster on the wall",
    "then he looks back at you",
    "deception check, i say we're pilgrims. eight. he doesn't believe you, he calls for more guards",
  ], ["town"], ["tense"]),
  talk("tense", "spider webs", ["dungeon", "calm"], [
    "the tunnel is full of webs",
    "thick ones, and there are bones wrapped up in them",
    "i'm burning the webs as we go",
    "something skitters in the ceiling above you",
  ], ["dungeon"], ["tense"]),

  // --- Tense stays tense ---
  talk("tense", "still hiding from the patrol", ["dungeon", "tense"], [
    "we're pressed against the wall in the dark",
    "the drow patrol is walking past, their torches getting closer",
    "stealth again. sixteen",
    "they walk past, one of them stops and sniffs the air",
  ], ["dungeon"], ["tense"]),
  talk("tense", "negotiation goes on", ["tavern", "tense"], [
    "the leader of the cloaks sits down at your table",
    "he says nobody needs to get hurt, just hand it over",
    "i say we don't have it, we sold it in neverwinter",
    "he smiles and says then you'll take us to neverwinter. his men spread out around the room",
  ], ["tavern"], ["tense"]),
  talk("tense", "creeping through the haunted house", ["interior", "tense"], [
    "the candles all go out at once",
    "i grab my holy symbol",
    "you hear a child laughing somewhere in the walls",
    "okay i really don't like this",
  ], ["interior"], ["tense"]),
  talk("tense", "storm still raging", ["travel", "tense"], [
    "the mast cracks, the captain is yelling to cut the rigging",
    "i'm cutting it, i'll use my axe",
    "the ship lurches, you see rocks ahead in the lightning",
    "can we steer away? roll it. eleven",
  ], ["travel"], ["tense"]),
  talk("tense", "following the tracks Web Speech", ["wilderness", "tense"], [
    "The tracks lead into a ravine",
    "There's blood on the rocks now",
    "And you can hear heavy breathing up ahead",
    "I want to sneak forward and look",
  ], ["wilderness"], ["tense"]),
  talk("tense", "rules check during the standoff", ["travel", "tense"], [
    "wait, can i ready an action to shoot him if he moves",
    "not outside of initiative, but tell me what you're doing and we'll see",
    "okay i've got my hand on my bow",
    "the bandit leader is still waiting for your answer, his men are getting twitchy",
  ], ["travel", "wilderness"], ["tense"]),

  // --- Tension passes ---
  talk("tense", "patrol leaves", ["dungeon", "tense"], [
    "the drow mutters something and they move on",
    "you wait until the torchlight is gone",
    "okay, phew, that was close",
    "we keep going the other way, carefully",
  ], ["dungeon"], ["calm", "tense"]),
  talk("tense", "bluff works at the gate", ["town", "tense"], [
    "persuasion, i show him the forged letter. twenty-two",
    "the sergeant reads it, frowns, then hands it back",
    "he says sorry for the trouble, go on through",
    "we walk through the gate into the city like we own the place",
  ], ["town"], ["calm"]),
  talk("tense", "eyes were deer", ["wilderness", "tense"], [
    "the eyes come closer",
    "and a herd of deer steps into the firelight",
    "oh thank god",
    "everyone goes back to sleep. the rest of the night is quiet",
  ], ["wilderness"], ["calm"]),
  talk("tense", "storm passes", ["travel", "tense"], [
    "by dawn the storm has blown itself out",
    "the sea is flat and grey, the crew is exhausted",
    "the captain thanks you for your help",
    "i'm going to sleep for about ten hours",
  ], ["travel"], ["calm"]),
  talk("tense", "trap disarmed", ["dungeon", "tense"], [
    "i jam my crowbar into the mechanism",
    "thieves' tools, nineteen. the ceiling grinds to a halt",
    "the door clicks open",
    "okay nobody touch anything else in this room",
  ], ["dungeon"], ["calm", "tense"]),
  talk("tense", "cloaks leave the tavern", ["tavern", "tense"], [
    "the leader stares at you for a long time",
    "then he stands up and says we'll be watching, and they leave",
    "the room slowly gets noisy again, someone starts the music back up",
    "i need another drink",
  ], ["tavern"], ["calm"]),
  talk("tense", "hostage released Web Speech", ["interior", "tense"], [
    "I put the relic on the floor and slide it over",
    "He grabs it and lets go of the mayor and runs out through the back",
    "The mayor collapses into a chair crying",
    "I go over and check she's OK",
  ], ["interior"], ["calm", "tense"]),
  talk("tense", "bandits accept the toll", ["travel", "tense"], [
    "fine, twenty each, final offer",
    "the leader thinks about it and nods, his men lower their crossbows",
    "we pay and they move the tree",
    "we ride on and nobody says anything for a while",
  ], ["travel"], ["calm"]),
];
