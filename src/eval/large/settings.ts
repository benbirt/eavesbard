import type { Scenario } from "../scenarios.js";
import { talk } from "./make.js";

/** Calm scenes: the setting changes, or stays put while people talk about other places. */
export const SETTINGS_SET: Scenario[] = [
  // --- Into a tavern ---
  talk("setting", "walking into the inn out of the rain", ["town", "calm"], [
    "you get to the edge of town just as it starts pouring",
    "there's a sign with a sleeping dragon on it, warm light in the windows",
    "we go in, definitely going in",
    "it's crowded, smells of wet dog and stew, a halfling is playing the fiddle by the fire",
  ], ["tavern"], ["calm"]),
  talk("setting", "renting rooms Web Speech", ["travel", "calm"], [
    "So after three days on the road you finally reach Millbrook",
    "We head straight for the inn",
    "The innkeeper is a big woman called Martha she asks how many rooms",
    "Three rooms and a bath please I smell like a horse",
  ], ["tavern"], ["calm"]),
  talk("setting", "back at the guild tavern", ["interior", "calm"], [
    "you hand the scrolls to the archivist and she thanks you",
    "okay let's go back to the uh the Gilded Tankard and celebrate",
    "you push through the doors and the regulars cheer, the barkeep already pouring your usual",
    "i buy a round for everyone",
  ], ["tavern"], ["calm"]),
  talk("setting", "tavern quest board", ["town", "calm"], [
    "the notice board said to ask at the Rusty Anchor",
    "so we find the rusty anchor, it's a dockside dive",
    "sailors at every table, a parrot on the bar",
    "i ask the bartender who posted the job about the sea serpent",
  ], ["tavern"], ["calm"]),
  talk("setting", "stays in the tavern talking about the forest", ["tavern", "calm"], [
    "the old ranger takes a long drink and says the forest has changed",
    "he says nobody goes past the standing stones any more, not since the winter",
    "what's past the standing stones",
    "he shrugs, an old elven road, ruins maybe, he just orders another ale",
  ], ["tavern", "unknown"], ["calm"]),
  talk("setting", "planning a dungeon trip at the inn", ["tavern", "calm"], [
    "okay so the plan is we go to the crypt tomorrow morning",
    "we need rope torches and like holy water if they've got any",
    "i'll ask the innkeeper if she knows a priest",
    "she says brother aldric at the chapel sells it, but you finish your dinner first",
  ], ["tavern", "unknown"], ["calm"]),

  // --- Into town ---
  talk("setting", "leaving the inn for the market", ["tavern", "calm"], [
    "okay in the morning you settle up and head out",
    "we go to the market, i need arrows",
    "the market square is packed, stalls everywhere, someone selling roasted nuts",
    "there's a fletcher on the corner, his prices look fair",
  ], ["town"], ["calm"]),
  talk("setting", "arriving in the city", ["travel", "calm"], [
    "the road crests the hill and there it is, waterdeep",
    "you pass through the gate, the guards barely look at you",
    "streets are cobbled, people everywhere, a town crier shouting the news",
    "i want to find the street of silk, my contact lives there",
  ], ["town"], ["calm"]),
  talk("setting", "village visit Web Speech", ["wilderness", "calm"], [
    "The trees thin out and you see smoke from chimneys",
    "It's a small village maybe twenty houses and a well in the middle",
    "Kids run over to look at the horses",
    "I ask one of them where the headman lives",
  ], ["town"], ["calm"]),
  talk("setting", "docks at sunset", ["interior", "calm"], [
    "we leave the warehouse and walk down to the docks",
    "um the tide's coming in, gulls, fishermen hauling nets",
    "i look for a ship called the grey maiden",
    "she's tied up at pier six, a sailor is coiling rope on the gangplank",
  ], ["town"], ["calm"]),
  talk("setting", "shopping for armour", ["tavern", "calm"], [
    "i want to go to the blacksmith",
    "sure you walk down the high street to the smithy, the forge is roaring",
    "how much for a breastplate",
    "he says four hundred gold, you laugh, he says three fifty",
  ], ["town", "interior"], ["calm"]),
  talk("setting", "festival in the square", ["travel", "calm"], [
    "when you ride in the whole town's decorated with ribbons",
    "it's the midsummer festival, there's dancing in the square",
    "i enter the pie eating contest",
    "roll constitution. nineteen. you eat eleven pies",
  ], ["town"], ["calm"]),

  // --- Into a building ---
  talk("setting", "audience at the keep", ["town", "calm"], [
    "the guards lead you up to the keep",
    "through a big oak door into the great hall, banners on the walls",
    "lord neverember is sitting at the head of a long table",
    "we bow, i do the talking",
  ], ["interior"], ["calm"]),
  talk("setting", "temple visit", ["town", "calm"], [
    "we need healing so we go to the temple of lathander",
    "it's all white marble inside, sunlight through stained glass",
    "a priestess in orange robes comes over and asks how she can help",
    "my friend has a curse, can you look at his arm",
  ], ["interior"], ["calm"]),
  talk("setting", "library research", ["tavern", "calm"], [
    "i want to research the symbol we found",
    "okay you go to the university library, endless shelves, smell of dust",
    "a gnome librarian shushes you",
    "investigation check, that's a fourteen. you find a book on old cults",
  ], ["interior"], ["calm"]),
  talk("setting", "magic shop", ["town", "calm"], [
    "there's a little shop with potions in the window",
    "we go in. a bell rings",
    "it's cramped, jars of eyeballs, a stuffed crocodile on the ceiling",
    "the tiefling behind the counter asks what you're looking for",
  ], ["interior"], ["calm"]),
  talk("setting", "mansion dinner", ["town", "calm"], [
    "you're shown into the mansion by a butler",
    "the dining room is lit by a chandelier, silver everywhere",
    "lady harrow welcomes you and you all sit down to eat",
    "i'm going to try not to use the wrong fork",
  ], ["interior"], ["calm"]),
  talk("setting", "back in the wizard's study", ["town", "calm"], [
    "we climb the tower stairs to meet the wizard again",
    "the study is the same mess as before, papers, a skull, a sleeping cat",
    "he looks up and says ah you're back, did you get the ingredients",
    "we hand over the mandrake root",
  ], ["interior"], ["calm"]),

  // --- Into the wilderness ---
  talk("setting", "into the forest", ["town", "calm"], [
    "you leave the village by the north road and soon you're in the trees",
    "the path narrows, it's quiet apart from birds",
    "i'm going to look for tracks",
    "survival, twelve. you see deer tracks, nothing worrying",
  ], ["wilderness"], ["calm"]),
  talk("setting", "making camp", ["travel", "calm"], [
    "okay it's getting dark, we should camp",
    "you find a clearing by a stream",
    "i'll get a fire going and cook the rabbits",
    "first watch is me and the cleric",
  ], ["wilderness"], ["calm"]),
  talk("setting", "climbing the mountain", ["travel", "calm"], [
    "the trail leaves the road and climbs up into the mountains",
    "the air is thin, snow on the peaks",
    "we rope up for the steep part",
    "athletics everyone. we all pass. you reach a ledge with an amazing view",
  ], ["wilderness"], ["calm"]),
  talk("setting", "swamp wading Web Speech", ["town", "calm"], [
    "So you leave the town behind and head into the marsh",
    "The ground gets soft and then it's water up to your knees",
    "Mosquitoes everywhere and the smell is awful",
    "I hold my pack above my head and keep going",
  ], ["wilderness"], ["calm", "tense"]),
  talk("setting", "desert oasis", ["travel", "calm"], [
    "after the caravan drops you off you head into the dunes on foot",
    "by evening you find an oasis, palm trees and a clear pool",
    "i fill all the waterskins",
    "and i'm just going to lie in the shade for a bit",
  ], ["wilderness"], ["calm"]),
  talk("setting", "beach landing", ["travel", "calm"], [
    "the rowboat scrapes onto the sand",
    "it's a small island, white beach, jungle behind it",
    "we pull the boat up above the tide line",
    "i want to explore along the beach first",
  ], ["wilderness"], ["calm"]),
  talk("setting", "meadow picnic", ["town", "calm"], [
    "we walk out of town to the meadow to meet the druid",
    "it's a sunny day, wildflowers, a few sheep",
    "the druid is sitting under an oak, she waves you over",
    "i brought cheese and bread, we can have lunch",
  ], ["wilderness"], ["calm"]),

  // --- Into a dungeon ---
  talk("setting", "down the well", ["town", "calm"], [
    "the map says the entrance is at the bottom of the old well",
    "we tie off a rope and climb down",
    "at the bottom there's a tunnel, stone walls, very old",
    "i light a torch and we go in, i'm at the front",
  ], ["dungeon"], ["calm", "tense"]),
  talk("setting", "entering the mine", ["wilderness", "calm"], [
    "you find the mine entrance in the side of the hill, timber supports",
    "we go in, carefully",
    "rail tracks lead down into the dark, there's a rusty cart",
    "i'm checking the supports to see if they're safe",
  ], ["dungeon"], ["calm", "tense"]),
  talk("setting", "crypt below the church", ["interior", "calm"], [
    "behind the altar there's a trapdoor",
    "we open it, stairs go down",
    "it's a crypt, stone coffins in niches along the walls, cold air",
    "i read the names on the coffins",
  ], ["dungeon"], ["calm", "tense"]),
  talk("setting", "sewers shortcut", ["town", "calm"], [
    "if we use the sewers we can get past the city watch",
    "fine, we lift the grate and drop down",
    "it stinks, there's a walkway beside the channel",
    "we follow the map left at the first junction",
  ], ["dungeon"], ["tense"]),
  talk("setting", "exploring a cave", ["wilderness", "calm"], [
    "behind the waterfall there's a cave",
    "we squeeze in behind the water",
    "inside it opens up, glowing mushrooms on the walls, it's actually kind of pretty",
    "i'm going to take a sample of the mushrooms",
  ], ["dungeon"], ["calm"]),
  talk("setting", "ruins underground", ["wilderness", "calm"], [
    "the stairs under the ruined tower go down a long way",
    "you come out in a vaulted hall, pillars, carvings of old kings",
    "dust everywhere, nobody's been here in centuries",
    "history check on the carvings. eighteen. they're netherese",
  ], ["dungeon"], ["calm", "tense"]),

  // --- Onto the road or at sea ---
  talk("setting", "setting off on the road", ["town", "calm"], [
    "okay so we've got supplies, we head out the east gate",
    "the trade road runs along the river",
    "it's going to be four days to the capital if the weather holds",
    "i'll drive the cart and you lot can walk",
  ], ["travel"], ["calm"]),
  talk("setting", "boarding the ship", ["town", "calm"], [
    "the captain waves you aboard",
    "they cast off and the ship heads out of the harbour",
    "once you're out at sea the wind picks up nicely",
    "i'm going to be sick over the side. roll con. six. yeah you are",
  ], ["travel"], ["calm"]),
  talk("setting", "riding all day Web Speech", ["tavern", "calm"], [
    "Next morning you saddle up and ride north",
    "The road is empty you pass farms and then just fields",
    "We ride until dusk and see nobody",
    "Is there anywhere to stop for the night",
  ], ["travel", "wilderness"], ["calm"]),
  talk("setting", "river barge", ["town", "calm"], [
    "we pay for passage on the barge",
    "the barge pushes off and drifts downriver",
    "i'm going to fish off the back",
    "you catch a trout. the bargemaster says we'll reach riverton by noon tomorrow",
  ], ["travel"], ["calm"]),
  talk("setting", "caravan days", ["town", "calm"], [
    "the caravan leaves at dawn, twelve wagons",
    "days pass, dust, camels, the guards sing bawdy songs",
    "i make friends with the cook",
    "on the fifth day you can see the mountains ahead",
  ], ["travel"], ["calm"]),
  talk("setting", "airship voyage", ["town", "calm"], [
    "the airship rises off the tower and the city falls away",
    "clouds go past under you",
    "the gnome pilot says we'll be there by morning",
    "i'm going to find a hammock and sleep",
  ], ["travel"], ["calm"]),

  // --- Staying put while other places come up ---
  talk("setting", "town: hearing about the dungeon", ["town", "calm"], [
    "the guard captain points up the hill",
    "she says the old keep's been empty for years but lately there are lights at night",
    "and there's tunnels under it, the goblins used them",
    "okay we should check that out tomorrow, for now let's find the general store",
  ], ["town", "unknown"], ["calm"]),
  talk("setting", "travel: talking about the city ahead", ["travel", "calm"], [
    "while you ride the merchant tells you about baldur's gate",
    "he says the lower city is dangerous at night and the taverns water their ale",
    "what about the temples, is there one to tymora",
    "he laughs and says there's a temple to everyone in baldur's gate",
  ], ["travel", "unknown"], ["calm"]),
  talk("setting", "dungeon: remembering the tavern", ["dungeon", "calm"], [
    "we've cleared this room so let's take a short rest",
    "honestly i miss the inn, i could do with a hot meal",
    "remember the stew at the prancing pony",
    "okay short rest, everyone spend hit dice",
  ], ["dungeon", "unknown"], ["calm"]),
  talk("setting", "interior: looking at a map of the forest", ["interior", "calm"], [
    "the cartographer unrolls a big map on the table",
    "this is the darkwood, she says, and here's the river, the ford is here",
    "how long would it take to walk to the ford",
    "about two days she says, and she charges you ten gold for a copy",
  ], ["interior", "unknown"], ["calm"]),
  talk("setting", "wilderness: talking about the ship", ["wilderness", "calm"], [
    "we're sitting around the campfire",
    "so how do we get to the islands, do we need a ship",
    "we could hire one in port nyanzaru",
    "let's sleep on it. i take first watch",
  ], ["wilderness", "unknown"], ["calm"]),
  talk("setting", "tavern: story about the castle", ["tavern", "calm"], [
    "the old soldier tells you about the siege of the castle",
    "he says they held the gate for nine days",
    "and the dragon came on the tenth",
    "everyone at the table goes quiet. i buy him another drink",
  ], ["tavern", "unknown"], ["calm", "tense"]),

  // --- Mixed, with table talk around the move ---
  talk("setting", "into the inn with dice talk", ["travel", "calm"], [
    "can you pass me the d20, the blue one",
    "anyway you arrive at the crossroads inn as it gets dark",
    "a stable boy takes your horses",
    "inside it's warm, there's a fire going and a few travellers eating",
  ], ["tavern"], ["calm"]),
  talk("setting", "leaving the dungeon", ["dungeon", "calm"], [
    "okay that's the last room, there's nothing else down here",
    "we go back up the stairs and out",
    "you come out into daylight, the forest is just as you left it",
    "i'm so glad to be out of there",
  ], ["wilderness"], ["calm"]),
  talk("setting", "ship arrives in port", ["travel", "calm"], [
    "after six days at sea the lookout shouts land",
    "the ship docks in the harbour, it's a busy port town",
    "we get off and find our land legs",
    "first thing i want to find a bathhouse",
  ], ["town"], ["calm"]),
  talk("setting", "tavern to temple Web Speech", ["tavern", "calm"], [
    "OK we've had breakfast",
    "Let's go see the priest at the temple",
    "You walk up the hill to the temple and the doors are open",
    "Inside there are candles everywhere and someone is singing",
  ], ["interior"], ["calm"]),
  talk("setting", "town to tavern short", ["town", "calm"], [
    "let's get a drink",
    "you step into the nearest tavern, it's quiet this early",
  ], ["tavern"], ["calm"]),
  talk("setting", "wilderness to cave short", ["wilderness", "calm"], [
    "we head into the cave to get out of the rain",
  ], ["dungeon", "wilderness"], ["calm"]),
  talk("setting", "into the castle Web Speech", ["town", "calm"], [
    "We show the guards the letter with the king's seal",
    "They open the gates and lead us into the castle",
    "We walk down a long corridor with tapestries",
    "And into the throne room",
  ], ["interior"], ["calm"]),
  talk("setting", "back on the road after the village", ["town", "calm"], [
    "we say goodbye to the headman",
    "and we're back on the road heading south",
    "the road is muddy from the rain",
    "we'll keep going until the next waystation",
  ], ["travel"], ["calm"]),
  talk("setting", "forest to ruins above ground", ["wilderness", "calm"], [
    "we follow the stream until we see the ruins",
    "it's an old elven shrine, half covered in ivy, open to the sky",
    "i'm going to look around the broken statues",
    "investigation. eleven. it's just moss and some old coins",
  ], ["wilderness", "interior"], ["calm"]),
  talk("setting", "mansion to street", ["interior", "calm"], [
    "we thank lady harrow and leave",
    "back out on the street it's already dark, lamplighters going round",
    "we walk back through the merchant quarter",
    "i'm keeping an eye out for pickpockets",
  ], ["town"], ["calm"]),
];
