import type { Scenario } from "../scenarios.js";
import { talk } from "./make.js";

/** A fight starts: from calm or tense, often in a single line. */
export const COMBAT_STARTS_SET: Scenario[] = [
  // --- Short, as speech recognition often delivers them ---
  talk("combat starts", "short: roll for initiative", ["tavern", "calm"], [
    "Roll for initiative",
  ], ["tavern", "unknown"], ["combat"]),
  talk("combat starts", "short: role for initiative (misheard)", ["tavern", "calm"], [
    "Role for initiative",
  ], ["tavern", "unknown"], ["combat"]),
  talk("combat starts", "short: roll initiative everyone", ["wilderness", "tense"], [
    "okay everyone roll initiative",
  ], ["wilderness", "unknown"], ["combat"]),
  talk("combat starts", "short: they attack", ["travel", "calm"], [
    "the bandits attack",
  ], ["travel", "wilderness", "unknown"], ["combat"]),
  talk("combat starts", "short: let's fight", ["dungeon", "tense"], [
    "let's fight",
  ], ["dungeon", "unknown"], ["combat"]),
  talk("combat starts", "short: i attack him", ["tavern", "tense"], [
    "i'm attacking him. i swing my axe at the guy in the black cloak",
  ], ["tavern", "unknown"], ["combat"]),
  talk("combat starts", "short: what did everyone get", ["dungeon", "calm"], [
    "initiative order, what did everyone get. seventeen. twelve. four",
  ], ["dungeon", "unknown"], ["combat"]),
  talk("combat starts", "short: the goblins charge", ["wilderness", "calm"], [
    "the goblins charge out of the bushes screaming",
  ], ["wilderness", "unknown"], ["combat"]),

  // --- From calm ---
  talk("combat starts", "bar fight breaks out", ["tavern", "calm"], [
    "the half-orc spills his drink on you and says watch it",
    "i say you watch it and i shove him",
    "he swings a punch at you. roll initiative",
    "nineteen. eleven. two, typical",
  ], ["tavern"], ["combat"]),
  talk("combat starts", "wolves at the camp", ["wilderness", "calm"], [
    "we're all asleep except the ranger",
    "the wolves come out of the dark, they go for the horses first",
    "i shout and wake everyone up",
    "roll initiative, and anyone who was asleep has disadvantage",
  ], ["wilderness"], ["combat"]),
  talk("combat starts", "ambush on the road Web Speech", ["travel", "calm"], [
    "The road is quiet and the sun is shining",
    "Suddenly arrows fly out of the trees one hits the horse",
    "Everyone roll for initiative",
    "I got a 15",
  ], ["travel", "wilderness"], ["combat"]),
  talk("combat starts", "skeletons rise in the crypt", ["dungeon", "calm"], [
    "i open the coffin to see what's inside",
    "the skeleton inside sits up, and so do all the others in the room",
    "oh no",
    "initiative! the skeleton nearest you swings its rusty sword, that's a hit, six damage",
  ], ["dungeon"], ["combat"]),
  talk("combat starts", "mimic chest", ["dungeon", "calm"], [
    "i want to open the chest",
    "you put your hand on the lid and it's sticky",
    "the chest grows teeth and bites your arm, eleven piercing and you're stuck",
    "everybody roll initiative",
  ], ["dungeon"], ["combat"]),
  talk("combat starts", "pirates board the ship", ["travel", "calm"], [
    "a ship comes out of the fog flying a black flag",
    "grappling hooks thud into the rail and pirates swing over",
    "roll initiative",
    "i go first, i fire my crossbow at the one on the rope",
  ], ["travel"], ["combat"]),
  talk("combat starts", "street brawl with thugs", ["town", "calm"], [
    "the thugs block the alley",
    "one of them pulls a knife and lunges at the bard",
    "sixteen to hit, does that hit",
    "yes, you take four. okay everybody initiative",
  ], ["town"], ["combat"]),
  talk("combat starts", "the duke's guards attack", ["interior", "calm"], [
    "the duke stands up and points at you, arrest them",
    "guards come in from every door with halberds",
    "we're not going quietly. initiative?",
    "yep, initiative",
  ], ["interior"], ["combat"]),
  talk("combat starts", "owlbear charges", ["wilderness", "calm"], [
    "you hear a crashing in the trees",
    "an owlbear bursts out and charges straight at the fighter",
    "it's surprised you so it gets a free round. claw, claw, that's twenty two damage",
    "twenty two? okay i'm still up. roll initiative everyone",
  ], ["wilderness"], ["combat"]),
  talk("combat starts", "the mayor was a vampire", ["interior", "calm"], [
    "the mayor smiles and you see his fangs",
    "he says you should have left town when you had the chance",
    "he leaps across the table at the cleric",
    "initiative. i'm going to need a twenty here. eight. damn",
  ], ["interior"], ["combat"]),
  talk("combat starts", "dragon attacks the village", ["town", "calm"], [
    "the harvest festival is in full swing",
    "a shadow passes over and people start screaming",
    "a red dragon lands on the town hall and breathes fire across the square",
    "dex saves everyone, then initiative",
  ], ["town"], ["combat"]),
  talk("combat starts", "Web Speech no punctuation", ["dungeon", "calm"], [
    "we walk into the big room with the pillars",
    "four orcs are sitting around a fire they see us and grab their axes",
    "roll initiative",
    "I got 13 I got 7",
  ], ["dungeon"], ["combat"]),

  // --- From tense ---
  talk("combat starts", "negotiation fails", ["tavern", "tense"], [
    "i say we don't have the amulet",
    "the leader sighs and says pity, kill them",
    "his men draw their swords",
    "initiative everyone. i'm going first, i flip the table at them",
  ], ["tavern"], ["combat"]),
  talk("combat starts", "patrol spots us", ["dungeon", "tense"], [
    "the drow turns around and looks right at you",
    "he shouts something and they draw their blades",
    "roll for initiative",
    "eighteen, i want to cast hypnotic pattern",
  ], ["dungeon"], ["combat"]),
  talk("combat starts", "the creature in the river attacks", ["wilderness", "tense"], [
    "the dark shape comes at you fast",
    "it's a giant crocodile, it bites the rogue, roll a strength save",
    "nine. you're grappled and being pulled under",
    "everyone else roll initiative",
  ], ["wilderness"], ["combat"]),
  talk("combat starts", "bandits open fire", ["travel", "tense"], [
    "i tell him we're not paying anything",
    "he shrugs and says shoot them",
    "crossbow bolts hit the cart, one hits the wizard for seven",
    "initiative, everyone. the wizard's at four hit points already",
  ], ["travel", "wilderness"], ["combat"]),
  talk("combat starts", "ghost attacks", ["interior", "tense"], [
    "the laughing gets louder",
    "a pale figure flies out of the wall straight through the paladin",
    "make a wisdom save. twelve. you're frightened",
    "initiative everyone, the ghost goes on nineteen",
  ], ["interior"], ["combat"]),
  talk("combat starts", "the thief turns to fight", ["town", "tense"], [
    "you corner the thief on the roof",
    "he pulls out two daggers and says come on then",
    "i attack. eighteen to hit",
    "that hits, roll damage. we're in initiative now by the way",
  ], ["town"], ["combat"]),
  talk("combat starts", "spiders drop from the ceiling", ["dungeon", "tense"], [
    "the skittering gets louder",
    "three giant spiders drop from the ceiling",
    "one lands on the cleric and bites, nine damage and make a con save",
    "initiative order is spider, me, spider, cleric",
  ], ["dungeon"], ["combat"]),
  talk("combat starts", "standoff breaks Web Speech", ["town", "tense"], [
    "The sergeant says seize them",
    "I cast thunderwave at the guards",
    "OK roll initiative first then we'll do the thunderwave",
    "Seventeen",
  ], ["town"], ["combat"]),
  talk("combat starts", "hostage taker lunges", ["interior", "tense"], [
    "i keep talking to distract him while the rogue sneaks round",
    "stealth, twenty one. you're behind him",
    "i stab him in the back. sneak attack",
    "the cultist screams and drops the knife, his followers attack, roll initiative",
  ], ["interior"], ["combat"]),
  talk("combat starts", "the dragon was awake", ["dungeon", "tense"], [
    "the dragon lifts its head and says thieves",
    "it breathes. everyone in a cone, dex save",
    "fourteen. eight. twenty",
    "half damage for you, full for you two. initiative",
  ], ["dungeon"], ["combat"]),

  // --- Fight starting amid crosstalk ---
  talk("combat starts", "with snack talk", ["wilderness", "calm"], [
    "can someone pass the crisps",
    "anyway as you walk along the path, hobgoblins step out in front of you, spears raised",
    "they don't talk, they just charge",
    "initiative! roll it",
  ], ["wilderness"], ["combat"]),
  talk("combat starts", "with rules talk first", ["dungeon", "calm"], [
    "is initiative dex or wis in this edition",
    "it's dex",
    "okay cool. so we kick the door in",
    "inside there are six kobolds, they shriek and attack, roll initiative for real now",
  ], ["dungeon"], ["combat"]),
];
