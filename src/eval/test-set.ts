// The held-out test set: realistic, messy scenes for comparing scene
// classifiers (DESIGN.md 7.5, experiment E9). Never used for tuning; tune on
// SCENARIOS in scenarios.ts. Transcript lines imitate Whisper on a noisy table:
// lower case, fillers, misheard words, crosstalk and dice maths.

import type { Intensity, Setting } from "../library/scenes.js";
import type { Category, Scenario } from "./scenarios.js";

type S = Setting | "unknown";

function opening(description: string, settings: S[], intensities: Intensity[]): Scenario {
  return { name: `opening: ${description}`, category: "opening", input: { description }, settings, intensities };
}

/** Lines are oldest first, 15 seconds apart, the last one 5 seconds ago. */
function talk(
  category: Category,
  name: string,
  current: [Setting, Intensity],
  lines: string[],
  settings: S[],
  intensities: Intensity[],
): Scenario {
  const n = lines.length;
  return {
    name,
    category,
    input: {
      scene: { setting: current[0], intensity: current[1] },
      lines: lines.map((text, i): [number, string] => [5 + (n - 1 - i) * 15, text]),
    },
    settings,
    intensities,
  };
}

export const TEST_SET: Scenario[] = [
  // --- Openings (30) ---
  opening("a smoky tavern on the edge of town", ["tavern"], ["calm"]),
  opening("a drinking contest at the dwarven alehouse", ["tavern"], ["calm"]),
  opening("the party meets their patron at the inn", ["tavern"], ["calm"]),
  opening("haggling in the bazaar", ["town"], ["calm"]),
  opening("a festival in the village square", ["town"], ["calm"]),
  opening("the slums at night, a cutpurse is following you", ["town"], ["tense"]),
  opening("a riot breaks out in the city streets", ["town"], ["combat", "tense"]),
  opening("a masked ball at the palace", ["interior"], ["calm"]),
  opening("a funeral in the temple of the sun god", ["interior"], ["calm"]),
  opening("an audience with the queen in the throne room", ["interior"], ["calm", "tense"]),
  opening("searching the abandoned wizard's tower", ["interior", "dungeon"], ["tense", "calm"]),
  opening("a calm night camping in the woods", ["wilderness"], ["calm"]),
  opening("lost in a blizzard on the mountain pass", ["wilderness", "travel"], ["tense"]),
  opening("wading through the swamp, something is stalking you", ["wilderness"], ["tense"]),
  opening("wolves attack the camp at night", ["wilderness"], ["combat"]),
  opening("a desert oasis at noon", ["wilderness"], ["calm"]),
  opening("exploring the crypt beneath the chapel", ["dungeon"], ["tense", "calm"]),
  opening("fleeing through the sewers", ["dungeon"], ["tense"]),
  opening("the dragon's lair, it is awake", ["dungeon"], ["combat", "tense"]),
  opening("an old dwarven mine full of traps", ["dungeon"], ["tense"]),
  opening("a long journey by carriage to the capital", ["travel"], ["calm"]),
  opening("sailing to the islands on a merchant ship", ["travel"], ["calm"]),
  opening("the ship is boarded by pirates", ["travel"], ["combat"]),
  opening("riding hard to escape the bandits chasing us", ["travel", "wilderness"], ["tense", "combat"]),
  opening("goblins ambush the caravan", ["travel", "wilderness"], ["combat"]),
  opening("a bar fight at the tavern", ["tavern"], ["combat"]),
  opening("storming the castle gates", ["interior", "town"], ["combat"]),
  opening("cultists performing a ritual in a cave", ["dungeon"], ["tense"]),
  opening("shopping for supplies before the adventure", ["town"], ["calm"]),
  opening("a ghost haunts the lighthouse", ["interior"], ["tense"]),

  // --- Settings, calm (24) ---
  talk("setting", "ordering drinks at the bar", ["town", "calm"], [
    "okay so you go in there's a there's a big hearth and maybe a dozen people drinking",
    "i walk up to the bar and order a pint of whatever's cheapest",
    "the innkeeper says that'll be two copper and asks if you want a room for the night",
    "yeah we'll take two rooms and um do you have any food",
  ], ["tavern"], ["calm"]),
  talk("setting", "gossip with the barmaid", ["tavern", "calm"], [
    "the barmaid sets down your mugs and leans in",
    "she says you didn't hear it from me but the miller's boy went missing three nights ago",
    "i slide her a silver piece and ask what else she knows",
    "uh roll persuasion. sixteen. okay she tells you about the lights in the old mill",
  ], ["tavern"], ["calm"]),
  talk("setting", "card game at the inn", ["tavern", "calm"], [
    "there's a card game going on at the corner table",
    "can i join in i want to play a few hands",
    "sure it's three card dragon, the dwarf dealing looks pretty drunk",
    "i'm gonna use sleight of hand to cheat. no don't do that we need these people",
  ], ["tavern"], ["calm"]),
  talk("setting", "market stalls", ["tavern", "calm"], [
    "next morning you head out into the market district",
    "it's busy, stalls selling fish and spices and there's a guy juggling",
    "i want to find a blacksmith to get my sword sharpened",
    "the smith's on the corner by the fountain, he quotes you five silver",
  ], ["town"], ["calm"]),
  talk("setting", "city gates and guards", ["travel", "calm"], [
    "you arrive at the city walls as the sun's going down",
    "there's a queue of carts waiting to get through the gate",
    "the guard asks for your names and business in waterdeep",
    "we're just here to sell some furs um and see the sights",
  ], ["town", "travel"], ["calm"]),
  talk("setting", "walking the docks", ["town", "calm"], [
    "we go down to the harbour to look for a ship heading south",
    "the docks stink of fish, sailors are loading crates onto a big three master",
    "i ask the nearest sailor who the captain is",
    "she points at a woman with a parrot shouting at the dock hands",
  ], ["town", "travel"], ["calm"]),
  talk("setting", "village elder", ["travel", "calm"], [
    "the village is just a dozen huts around a well",
    "kids run up to look at your horses",
    "an old woman comes out and introduces herself as the elder",
    "she invites you in for tea and says the harvest has been bad this year",
  ], ["town"], ["calm"]),
  talk("setting", "temple visit", ["town", "calm"], [
    "you go up the steps into the temple of lathander",
    "it's quiet inside, sunlight coming through stained glass",
    "a priestess is lighting candles at the altar",
    "i want to ask her if she can cure my disease, how much would that cost",
  ], ["interior"], ["calm"]),
  talk("setting", "library research", ["town", "calm"], [
    "the archivist leads you down rows and rows of shelves",
    "okay i want to research the symbol we found on the amulet",
    "make an investigation check. nineteen",
    "after a couple of hours you find a dusty book on old elven heraldry",
  ], ["interior"], ["calm"]),
  talk("setting", "noble's dinner", ["town", "calm"], [
    "the butler shows you into the dining hall, long table, silver candlesticks",
    "lord harrow is already seated and gestures for you to sit",
    "i'm going to try to remember which fork to use",
    "he asks how your journey was and offers you more wine",
  ], ["interior"], ["calm"]),
  talk("setting", "forest trail", ["town", "calm"], [
    "you head out of town on the forest road",
    "the trees get thicker and the light goes green",
    "i want to look for tracks, survival check, fourteen",
    "you see deer tracks and you hear a woodpecker somewhere",
  ], ["wilderness", "travel"], ["calm"]),
  talk("setting", "making camp", ["travel", "calm"], [
    "it's getting dark so we look for somewhere to camp",
    "there's a clearing by a stream that looks good",
    "i'll gather firewood and the ranger can set up the tents",
    "okay you get a fire going and cook the rabbits you caught",
  ], ["wilderness", "travel"], ["calm"]),
  talk("setting", "mountain climb", ["town", "calm"], [
    "the path gets steeper and the air gets colder",
    "we're above the tree line now, it's all rock and snow",
    "athletics checks everyone for the climb",
    "um i got a seven. you slip a bit but your rope holds",
  ], ["wilderness", "travel"], ["calm", "tense"]),
  talk("setting", "desert crossing", ["town", "calm"], [
    "day three in the desert and we're running low on water",
    "the dunes go on forever, heat shimmer everywhere",
    "can i use create water? yeah that helps",
    "you spot what might be an oasis on the horizon",
  ], ["wilderness", "travel"], ["calm", "tense"]),
  talk("setting", "into the cave", ["wilderness", "calm"], [
    "the cave mouth is about ten feet wide and it's pitch black inside",
    "i light a torch and we go in, i'm in front",
    "the passage slopes down and you can hear water dripping",
    "it opens out into a big cavern with stalactites",
  ], ["dungeon"], ["calm", "tense"]),
  talk("setting", "dungeon corridor", ["wilderness", "calm"], [
    "you're in a long stone corridor, there are old iron sconces on the walls",
    "i want to check for traps before we keep going",
    "investigation nineteen. you find a pressure plate in the floor",
    "okay we step over it and continue to the next door",
  ], ["dungeon"], ["calm", "tense"]),
  talk("setting", "old ruins", ["travel", "calm"], [
    "the ruins are just broken columns and half a wall now",
    "vines everywhere, it must have been a temple once",
    "i want to look at the carvings on the pillars",
    "history check. they're from the old empire, maybe a thousand years ago",
  ], ["dungeon", "wilderness"], ["calm"]),
  talk("setting", "mine tunnels", ["town", "calm"], [
    "the mine shaft goes down at a steep angle, old rails on the floor",
    "there are pickaxes and a rusty cart just abandoned",
    "it's like they all left in a hurry",
    "we keep following the rails deeper",
  ], ["dungeon"], ["calm", "tense"]),
  talk("setting", "on the road", ["town", "calm"], [
    "so you set off north along the king's road",
    "it's about four days to the next town",
    "we'll ride during the day and take turns on watch at night",
    "okay nothing much happens on the first two days, a few merchants pass you",
  ], ["travel", "wilderness"], ["calm"]),
  talk("setting", "on the ship", ["town", "calm"], [
    "the ship leaves port with the morning tide",
    "you've got hammocks below deck, it's cramped",
    "i want to help the sailors with the rigging to pass the time",
    "the sea's calm and you make good speed for three days",
  ], ["travel"], ["calm"]),
  talk("setting", "wagon ride", ["tavern", "calm"], [
    "the merchant agrees to let you ride on the back of his wagon",
    "it's slow going, the road's muddy from the rain",
    "i'll chat with the merchant, ask him where he's from",
    "he talks your ear off about the price of wool",
  ], ["travel"], ["calm"]),
  talk("setting", "shopping in a magic shop", ["town", "calm"], [
    "you step into the shop, there's a bell over the door",
    "shelves of potions and weird stuffed animals",
    "the gnome behind the counter asks if you're buying or browsing",
    "how much for the potion of healing. fifty gold. ouch",
  ], ["interior", "town"], ["calm"]),
  talk("setting", "back at the tavern", ["dungeon", "calm"], [
    "you get back to the yawning portal late that night",
    "durnan nods at you from behind the bar",
    "we want to sell the stuff we found and get drunk",
    "okay roll me some constitution saves for the drinking",
  ], ["tavern"], ["calm"]),
  talk("setting", "exploring the castle", ["wilderness", "calm"], [
    "the castle gates are open so you walk into the courtyard",
    "you go inside, there's a grand staircase and portraits on the walls",
    "i want to check the rooms on the ground floor",
    "the first one's a study, desk covered in letters",
  ], ["interior"], ["calm", "tense"]),

  // --- Tense (12) ---
  talk("tense", "something following", ["wilderness", "calm"], [
    "as you walk you get this feeling you're being watched",
    "perception check everyone",
    "eighteen. you catch a glimpse of something moving between the trees, keeping pace with you",
    "i draw my bow and we keep walking but slower",
  ], ["wilderness"], ["tense"]),
  talk("tense", "creaking door in the dark", ["dungeon", "calm"], [
    "you hear a door creak open somewhere behind you",
    "nobody move. i put out the torch",
    "it's completely dark now. you hear footsteps, slow, getting closer",
    "i hold my breath and get my dagger out",
  ], ["dungeon"], ["tense"]),
  talk("tense", "sneaking past guards", ["interior", "calm"], [
    "there are two guards at the end of the corridor playing dice",
    "we need to get past them without being seen",
    "stealth checks. twelve. fifteen. uh four",
    "the guard looks up, did you hear something",
  ], ["interior"], ["tense"]),
  talk("tense", "tense negotiation", ["tavern", "calm"], [
    "the half orc slams his fist on the table",
    "he says you owe the guild two hundred gold and you have till dawn",
    "his friends behind him have their hands on their swords",
    "i say very slowly that we don't want any trouble",
  ], ["tavern"], ["tense"]),
  talk("tense", "trap disarming", ["dungeon", "calm"], [
    "the chest has a needle trap on the lock",
    "i'm going to try and disarm it, thieves tools",
    "if you fail it's poison. everyone step back",
    "okay rolling. ten plus seven, seventeen. does that do it",
  ], ["dungeon"], ["tense"]),
  talk("tense", "haunted house", ["town", "calm"], [
    "the front door swings open on its own",
    "inside it's freezing cold and you can see your breath",
    "somewhere upstairs a child is singing",
    "i really don't want to go up there. we have to",
  ], ["interior"], ["tense"]),
  talk("tense", "monster tracks", ["wilderness", "calm"], [
    "you find tracks in the mud, huge, three toes",
    "survival check. you think it's an owlbear and the tracks are fresh",
    "there's blood on the bushes here",
    "we need to be really careful, weapons ready",
  ], ["wilderness"], ["tense"]),
  talk("tense", "storm at sea", ["travel", "calm"], [
    "the sky goes black and the wind picks up",
    "the captain shouts to take in the sails",
    "waves are crashing over the deck, roll strength to hold on to the rope",
    "nine. you slide across the deck towards the rail",
  ], ["travel"], ["tense"]),
  talk("tense", "chase through alleys", ["town", "calm"], [
    "the thief grabs the purse and runs",
    "after him, i'm sprinting down the alley",
    "he vaults over a cart and ducks into a side street",
    "roll athletics to keep up. fourteen. you're gaining on him",
  ], ["town"], ["tense"]),
  talk("tense", "eerie crypt", ["dungeon", "calm"], [
    "the crypt is lined with stone sarcophagi",
    "one of the lids is slightly open",
    "you hear scratching from inside it",
    "i back away slowly and whisper that we should leave",
  ], ["dungeon"], ["tense"]),
  talk("tense", "dragon sleeping", ["dungeon", "calm"], [
    "the cavern is full of gold and in the middle of it a red dragon is sleeping",
    "smoke curls out of its nostrils every time it breathes",
    "we need to grab the sword and get out without waking it",
    "everyone make a stealth check with disadvantage because of the coins",
  ], ["dungeon"], ["tense"]),
  talk("tense", "ambush suspected", ["travel", "calm"], [
    "the road narrows between two cliffs",
    "perfect place for an ambush, i say",
    "i send my familiar up to scout. it sees movement behind the rocks",
    "we stop the wagon and get our weapons out",
  ], ["travel", "wilderness"], ["tense"]),

  // --- Combat in progress (12) ---
  talk("combat", "melee round", ["dungeon", "combat"], [
    "okay it's your turn",
    "i attack the skeleton with my warhammer, that's a nineteen",
    "that hits, roll damage. eight bludgeoning plus two",
    "it shatters. next up is the zombie, it lurches at the cleric",
  ], ["dungeon"], ["combat"]),
  talk("combat", "spellcasting round", ["wilderness", "combat"], [
    "i cast fireball centred on the three bandits",
    "dex saves. fifteen, nine, twelve. two of them fail",
    "that's twenty eight fire damage, half for the one who saved",
    "the two who failed drop. the third is badly burned and screams",
  ], ["wilderness"], ["combat"]),
  talk("combat", "bar brawl", ["tavern", "calm"], [
    "the drunk swings a chair at you",
    "i'll dodge and punch him, unarmed strike, fourteen to hit",
    "his mate breaks a bottle and comes at the bard",
    "roll initiative, everyone in the tavern is fighting now",
  ], ["tavern"], ["combat"]),
  talk("combat", "boss fight", ["dungeon", "combat"], [
    "the lich raises its hand and everyone needs to make a con save",
    "eleven, i fail. you take thirty necrotic damage",
    "i'm down to four hit points",
    "my turn, healing word on the paladin and then i move behind the pillar",
  ], ["dungeon"], ["combat"]),
  talk("combat", "ship boarding", ["travel", "tense"], [
    "the pirates throw grappling hooks and swing onto the deck",
    "roll initiative",
    "the first pirate lands next to you and slashes, does sixteen hit",
    "yes. you take seven slashing. okay my turn i stab him with my rapier",
  ], ["travel"], ["combat"]),
  talk("combat", "wolves", ["wilderness", "tense"], [
    "the wolves circle the camp and then charge",
    "the big one bites the ranger, that's a strength save or you're prone",
    "i fail, i'm on the ground",
    "i shoot it with my bow, two arrows, both hit",
  ], ["wilderness"], ["combat"]),
  talk("combat", "street fight", ["town", "tense"], [
    "the city watch draws their swords and charges you",
    "i don't want to kill them, i'll attack to knock out",
    "thirteen to hit, does that hit their chain mail. no",
    "the sergeant hits you with his halberd for ten",
  ], ["town"], ["combat"]),
  talk("combat", "fighting in the throne room", ["interior", "tense"], [
    "the king's advisor reveals himself as a vampire",
    "initiative, he goes first and bites the fighter",
    "that's twelve piercing and you have to make a con save",
    "on my turn i hold person on him, wisdom save",
  ], ["interior"], ["combat"]),
  talk("combat", "messy dice talk", ["dungeon", "combat"], [
    "wait whose turn is it",
    "it's mine i think. ok i rage and attack twice",
    "first one's a crit so double the dice um that's twenty one",
    "the troll goes down but it's gonna regenerate unless we burn it",
  ], ["dungeon"], ["combat"]),
  talk("combat", "ogre charges", ["wilderness", "calm"], [
    "the ogre bursts out of the bushes and charges straight at you",
    "roll for initiative",
    "seventeen. eight. twenty",
    "okay the ranger's up first",
  ], ["wilderness"], ["combat"]),
  talk("combat", "guard fight in corridor", ["interior", "combat"], [
    "two more guards come round the corner",
    "i misty step behind them and shocking grasp the first one",
    "that's nine lightning damage and he can't take reactions",
    "the second guard swings at the rogue and misses",
  ], ["interior"], ["combat"]),
  talk("combat", "spider attack", ["dungeon", "tense"], [
    "the giant spider drops down from the ceiling onto the wizard",
    "it bites, that's poison damage, make a con save",
    "eight, i fail. you're poisoned",
    "i'm gonna hit it with my axe, twenty to hit",
  ], ["dungeon"], ["combat"]),

  // --- Combat starts (8): calm lines, then a fight in the latest ones ---
  talk("combat starts", "ambush on the road", ["travel", "calm"], [
    "we're riding along chatting about what we'll buy in the next town",
    "the road goes into a narrow pass between hills",
    "arrows suddenly start flying from the rocks above you",
    "roll initiative, bandits are pouring down the slope",
  ], ["travel", "wilderness"], ["combat"]),
  talk("combat starts", "tavern turns violent", ["tavern", "calm"], [
    "we're having a few drinks and listening to the bard",
    "a group of mercenaries comes in and the leader recognises the rogue",
    "he says you're the one who robbed us and draws his sword",
    "okay initiative everyone",
  ], ["tavern"], ["combat"]),
  talk("combat starts", "mimic chest", ["dungeon", "calm"], [
    "there's a treasure chest in the corner of the room",
    "i go to open it",
    "as you touch the lid it sprouts teeth and bites your hand",
    "it's a mimic, roll initiative, and take nine piercing",
  ], ["dungeon"], ["combat"]),
  talk("combat starts", "guards spot you", ["interior", "tense"], [
    "we're sneaking along the gallery",
    "stealth checks. five. oh no",
    "the guard shouts intruders and rings the alarm bell",
    "three guards run at you with spears drawn, initiative",
  ], ["interior"], ["combat"]),
  talk("combat starts", "wolves at camp", ["wilderness", "calm"], [
    "you're sitting around the fire telling stories",
    "the horses start panicking",
    "glowing eyes all around the edge of the firelight",
    "the wolves attack, everyone roll initiative",
  ], ["wilderness"], ["combat"]),
  talk("combat starts", "market brawl", ["town", "calm"], [
    "we're browsing the stalls for a new cloak",
    "the stall owner accuses the dwarf of stealing",
    "the dwarf headbutts him and his brothers grab clubs",
    "roll initiative, it's a fight in the middle of the market",
  ], ["town"], ["combat"]),
  talk("combat starts", "undead rise", ["dungeon", "tense"], [
    "the lids of the coffins slide open",
    "skeletal hands reach out",
    "six skeletons climb out with rusty swords",
    "initiative, they go first and swing at the paladin",
  ], ["dungeon"], ["combat"]),
  talk("combat starts", "sea monster", ["travel", "calm"], [
    "the sea is calm and the sailors are singing",
    "suddenly the ship lurches and a tentacle wraps round the mast",
    "a kraken surfaces next to the ship",
    "roll for initiative",
  ], ["travel"], ["combat"]),

  // --- Combat ends (12): a fight, then the aftermath in the latest lines ---
  talk("combat ends", "loot after skeletons", ["dungeon", "combat"], [
    "the last skeleton falls apart",
    "okay combat's over",
    "we search the room, is there anything valuable",
    "you find a silver ring and a pouch with thirty gold",
  ], ["dungeon"], ["calm", "tense"]),
  talk("combat ends", "short rest after wolves", ["wilderness", "combat"], [
    "the last wolf runs off whimpering into the trees",
    "i'm really hurt, can we take a short rest",
    "yeah you patch yourselves up, spend hit dice",
    "i roll two d10s, that's thirteen back",
  ], ["wilderness"], ["calm", "tense"]),
  talk("combat ends", "bandits surrender", ["travel", "combat"], [
    "the bandit leader drops his sword and puts his hands up",
    "please don't kill me, he says",
    "we tie them up and question them about who hired them",
    "intimidation check. eighteen. he tells you it was the mayor",
  ], ["travel", "wilderness"], ["calm", "tense"]),
  talk("combat ends", "after the brawl", ["tavern", "combat"], [
    "the last of the mercenaries staggers out the door",
    "the innkeeper comes out from behind the bar looking at the broken chairs",
    "we apologise and offer to pay for the damage",
    "he grumbles but pours you a drink on the house",
  ], ["tavern"], ["calm"]),
  talk("combat ends", "dragon flees", ["dungeon", "combat"], [
    "the dragon roars and flies off through a hole in the cavern roof",
    "is it gone? it's gone",
    "we're all on like five hit points",
    "let's grab as much gold as we can carry and get out of here before it comes back",
  ], ["dungeon"], ["tense", "calm"]),
  talk("combat ends", "healing up", ["interior", "combat"], [
    "the vampire turns to dust",
    "that's the end of combat, nice one",
    "i cast cure wounds on the fighter",
    "and i'll look around the throne room for clues",
  ], ["interior"], ["calm", "tense"]),
  talk("combat ends", "counting xp", ["wilderness", "combat"], [
    "the ogre falls with a thud",
    "everyone gets four hundred and fifty xp",
    "i think i level up, i'll do it at the end of the session",
    "we search the ogre's sack, smells awful",
  ], ["wilderness"], ["calm", "tense"]),
  talk("combat ends", "pirates defeated", ["travel", "combat"], [
    "the remaining pirates jump overboard",
    "the captain thanks you and the crew cheer",
    "we help clean up the deck and throw the bodies over",
    "the ship sails on, and you reach port two days later",
  ], ["travel", "town"], ["calm"]),
  talk("combat ends", "guards knocked out", ["interior", "combat"], [
    "the second guard slumps unconscious",
    "okay quick, we drag them into the closet",
    "we keep moving towards the treasury before anyone notices",
    "stealth checks again please",
  ], ["interior"], ["tense", "calm"]),
  talk("combat ends", "spider dead, poisoned", ["dungeon", "combat"], [
    "the spider curls up and dies",
    "i'm still poisoned though",
    "i'll use my herbalism kit to make an antitoxin",
    "okay that works, the poison wears off after an hour of rest",
  ], ["dungeon"], ["calm", "tense"]),
  talk("combat ends", "street fight over, watch arrives", ["town", "combat"], [
    "the thugs scatter when they hear the whistle",
    "the city watch arrives and asks what happened",
    "we explain they attacked us first",
    "persuasion. seventeen. the sergeant lets you go with a warning",
  ], ["town"], ["calm", "tense"]),
  talk("combat ends", "kraken retreats", ["travel", "combat"], [
    "you hack off the last tentacle and the kraken sinks back under the waves",
    "everyone's soaked and the mast is cracked",
    "the carpenter says he can fix it",
    "we sail on carefully for the rest of the day",
  ], ["travel"], ["calm", "tense"]),

  // --- Off-topic and rules talk (10): the scene should not change ---
  talk("off-topic", "pizza order", ["dungeon", "tense"], [
    "hang on before we go on is anyone hungry",
    "yeah let's order pizza",
    "i want pepperoni, can someone get the garlic bread",
    "okay it's ordered, thirty minutes",
  ], ["dungeon", "unknown"], ["tense"]),
  talk("off-topic", "rules lookup in combat", ["dungeon", "combat"], [
    "wait does sneak attack work if i'm using a light crossbow",
    "let me check the book",
    "yeah it does if you have advantage or an ally next to it",
    "okay cool so that's another three d6",
  ], ["dungeon", "unknown"], ["combat"]),
  talk("off-topic", "scheduling", ["tavern", "calm"], [
    "can we sort out next session before we forget",
    "i can't do next friday, i've got a wedding",
    "how about the saturday after",
    "saturday works for me",
  ], ["tavern", "unknown"], ["calm"]),
  talk("off-topic", "character sheet maths", ["wilderness", "tense"], [
    "hold on my armour class is wrong",
    "is it sixteen with the shield or eighteen",
    "chain mail is sixteen plus two for the shield so eighteen",
    "oh right i forgot the shield",
  ], ["wilderness", "unknown"], ["tense"]),
  talk("off-topic", "talking about a film", ["town", "calm"], [
    "did anyone see the new dune film",
    "yeah it was amazing the sound design was incredible",
    "i still haven't seen it no spoilers",
    "okay okay let's get back to the game",
  ], ["town", "unknown"], ["calm"]),
  talk("off-topic", "toilet break", ["interior", "tense"], [
    "can we pause for five minutes i need the loo",
    "sure let's take a break",
    "anyone want a cup of tea while the kettle's on",
    "milk no sugar please",
  ], ["interior", "unknown"], ["tense"]),
  talk("off-topic", "levelling up", ["tavern", "calm"], [
    "so i'm level five now what do i get",
    "you get extra attack and your proficiency goes up to three",
    "nice and i get another spell slot",
    "write it down before you forget",
  ], ["tavern", "unknown"], ["calm"]),
  talk("off-topic", "dice superstition", ["dungeon", "combat"], [
    "this d20 hates me i'm putting it in dice jail",
    "use mine it's been rolling hot all night",
    "okay with the lucky dice. twenty three",
    "ha told you",
  ], ["dungeon", "unknown"], ["combat"]),
  talk("off-topic", "phone call", ["travel", "calm"], [
    "sorry my phone's ringing it's my mum",
    "hi mum yeah we're just playing the game",
    "no i'll call you tomorrow",
    "sorry about that, where were we",
  ], ["travel", "unknown"], ["calm"]),
  talk("off-topic", "how initiative works", ["town", "calm"], [
    "quick question before we start",
    "when we roll initiative do we add dexterity or something else",
    "just dex unless you have a feat",
    "cool thanks",
  ], ["town", "unknown"], ["calm"]),
];
