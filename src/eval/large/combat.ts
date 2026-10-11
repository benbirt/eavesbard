import type { Scenario } from "../scenarios.js";
import { talk } from "./make.js";

/** Fights going on, including the table talk that happens mid-fight. */
export const COMBAT_SET: Scenario[] = [
  talk("combat", "trading blows with orcs", ["dungeon", "combat"], [
    "the orc swings at you, nineteen to hit",
    "that hits, i'm down to twelve",
    "my turn, i attack twice. fifteen and twenty two",
    "both hit. roll damage. fourteen slashing total",
  ], ["dungeon", "unknown"], ["combat"]),
  talk("combat", "spells flying", ["wilderness", "combat"], [
    "i cast fireball centred on the goblins by the cart",
    "dex save, they all fail. eight d6, that's thirty one",
    "they're all dead except the big one, he's smoking",
    "next up is the hobgoblin, he moves up and attacks the wizard",
  ], ["wilderness", "unknown"], ["combat"]),
  talk("combat", "whose turn Web Speech", ["town", "combat"], [
    "OK whose turn is it",
    "It's the rogue then the thug then me",
    "I'm going to disengage and run up the stairs",
    "The thug follows you and swings his club 14 to hit",
  ], ["town", "unknown"], ["combat"]),
  talk("combat", "healing mid fight", ["dungeon", "combat"], [
    "the paladin is down, he's making death saves",
    "i use my bonus action to cast healing word on him",
    "he gets up with seven hit points",
    "the skeleton attacks him again. misses, a twelve",
  ], ["dungeon", "unknown"], ["combat"]),
  talk("combat", "rules question mid fight", ["tavern", "combat"], [
    "can i grapple him and then shove him into the fire",
    "grapple's an attack, so yes if you've got two attacks",
    "athletics, twenty one, he's grappled. then i shove him",
    "the thug falls into the fireplace screaming. take six fire damage",
  ], ["tavern", "unknown"], ["combat"]),
  talk("combat", "dragon fight continues", ["dungeon", "combat"], [
    "the dragon uses a legendary action, tail attack on the fighter",
    "twenty three, hits. sixteen bludgeoning and you're knocked prone",
    "my turn, i stand up and attack it with my magic sword",
    "natural twenty! double the dice",
  ], ["dungeon", "unknown"], ["combat"]),
  talk("combat", "pirate battle on deck", ["travel", "combat"], [
    "the pirate captain swings across and lands next to the cleric",
    "she attacks, eighteen and twenty to hit, that's both",
    "i'm at three hit points",
    "okay my turn, i cast spiritual weapon and smack the captain with it",
  ], ["travel", "unknown"], ["combat"]),
  talk("combat", "dice maths during combat", ["wilderness", "combat"], [
    "hang on, is it plus five or plus seven with bless",
    "bless is a d4, so roll a d4 and add it",
    "fifteen plus three, eighteen",
    "that hits the troll, roll damage, and remember it regenerates unless it's fire or acid",
  ], ["wilderness", "unknown"], ["combat"]),
  talk("combat", "running away mid fight", ["dungeon", "combat"], [
    "there's too many of them, we need to run",
    "i cast fog cloud to cover our escape",
    "everyone dash back to the stairs, the ghouls get opportunity attacks",
    "the first one hits the bard. con save or you're paralysed",
  ], ["dungeon", "unknown"], ["combat"]),
  talk("combat", "concentration check", ["interior", "combat"], [
    "the mage hits you with a magic missile, ten damage",
    "that's a concentration check on hold person",
    "constitution save, i rolled a fourteen plus two",
    "you keep concentration. the duke is still held, the rogue gets advantage",
  ], ["interior", "unknown"], ["combat"]),
  talk("combat", "boss phase two", ["dungeon", "combat"], [
    "the lich's phylactery glows and he laughs",
    "you thought it would be that easy",
    "he casts power word stun on the paladin",
    "ugh. okay, my turn, i counterspell the next one",
  ], ["dungeon", "unknown"], ["combat"]),
  talk("combat", "mid fight with snack crosstalk", ["town", "combat"], [
    "is there more pizza",
    "yeah in the kitchen. anyway the cultist casts sacred flame on you, dex save",
    "nine, i fail",
    "you take eleven radiant. you're on your turn now",
  ], ["town", "unknown"], ["combat"]),
  talk("combat", "short: damage call", ["wilderness", "combat"], [
    "that's eighteen slashing damage and it's still standing",
  ], ["wilderness", "unknown"], ["combat"]),
  talk("combat", "short: your turn", ["dungeon", "combat"], [
    "okay it's your turn what do you do",
  ], ["dungeon", "unknown"], ["combat"]),
  talk("combat", "the fight gets worse", ["travel", "combat"], [
    "more goblins come over the ridge, there's like ten of them now",
    "ten? are you serious",
    "i'm going to drop a web on the path to slow them down",
    "the archers fire at the caster, two arrows hit, nine damage",
  ], ["travel", "wilderness", "unknown"], ["combat"]),
  talk("combat", "one enemy left but fighting", ["dungeon", "combat"], [
    "the last orc is bloodied but still swinging",
    "he attacks the fighter, misses",
    "i attack him. twelve to hit",
    "that misses, he's got a shield. he's still up",
  ], ["dungeon", "unknown"], ["combat"]),
  talk("combat", "fight around the tavern bar Web Speech", ["tavern", "combat"], [
    "I throw a chair at him",
    "Roll an attack with improvised weapon disadvantage",
    "Sixteen does that hit",
    "Yeah it smashes over his head two damage and he's really angry now",
  ], ["tavern", "unknown"], ["combat"]),
  talk("combat", "enemies flee but some still fight", ["wilderness", "combat"], [
    "two of the gnolls turn and run into the woods",
    "but the pack lord is still here and he howls and bites the ranger",
    "fourteen piercing damage",
    "i'm going to hit him with hunter's mark and shoot",
  ], ["wilderness", "unknown"], ["combat"]),
  talk("combat", "combat in the throne room", ["interior", "combat"], [
    "the king's guards are down but the usurper draws his sword",
    "he attacks the paladin three times",
    "two hit, that's twenty damage",
    "i smite him with everything i've got",
  ], ["interior", "unknown"], ["combat"]),
  talk("combat", "big damage roll", ["dungeon", "combat"], [
    "sneak attack, that's five d6 plus the d8",
    "rolling, okay, twenty six",
    "it's really hurt but it's not dead",
    "the beholder turns its eye rays on you. roll a dex save",
  ], ["dungeon", "unknown"], ["combat"]),
];

/** Fights ending: enemies dead, fled or surrendered, then looting, healing and talk. */
export const COMBAT_ENDS_SET: Scenario[] = [
  talk("combat ends", "last orc dies, looting", ["dungeon", "combat"], [
    "i hit the last orc. twenty",
    "you cut him down. that's the last of them",
    "okay i search the bodies",
    "you find twelve gold, a rusty key and a crude map",
  ], ["dungeon", "unknown"], ["calm", "tense"]),
  talk("combat ends", "short: that's the last of them", ["wilderness", "combat"], [
    "and that's the last of them, the fight's over",
  ], ["wilderness", "unknown"], ["calm", "tense"]),
  talk("combat ends", "short: combat over", ["tavern", "combat"], [
    "okay combat over",
  ], ["tavern", "unknown"], ["calm", "tense"]),
  talk("combat ends", "short: we can stop initiative", ["dungeon", "combat"], [
    "they're all dead, we can drop out of initiative",
  ], ["dungeon", "unknown"], ["calm", "tense"]),
  talk("combat ends", "bandits surrender", ["travel", "combat"], [
    "the bandit leader drops his sword and puts his hands up",
    "please, mercy, we'll go",
    "we tie them up",
    "i want to question the leader about who hired them",
  ], ["travel", "wilderness", "unknown"], ["tense"]),
  talk("combat ends", "wolves flee", ["wilderness", "combat"], [
    "the alpha wolf yelps and runs, the others follow it into the dark",
    "they're gone",
    "is anyone hurt",
    "i'm at nine, can someone heal me, then let's get back to sleep",
  ], ["wilderness", "unknown"], ["calm"]),
  talk("combat ends", "short rest after the fight", ["dungeon", "combat"], [
    "with the skeletons destroyed the crypt goes quiet",
    "let's take a short rest in here",
    "okay an hour passes, spend hit dice",
    "i roll two, that's fifteen back",
  ], ["dungeon", "unknown"], ["calm"]),
  talk("combat ends", "after the bar fight Web Speech", ["tavern", "combat"], [
    "The half orc is out cold on the floor",
    "The barkeep comes over and says you're paying for the chairs",
    "Fine fine how much",
    "Ten silver and you can stay",
  ], ["tavern", "unknown"], ["calm"]),
  talk("combat ends", "dragon dies", ["dungeon", "combat"], [
    "the dragon lets out a final roar and collapses on its hoard",
    "is it dead dead",
    "it's dead. the cave shakes and then it's quiet",
    "loot. so much loot. i'm diving into the gold",
  ], ["dungeon", "unknown"], ["calm"]),
  talk("combat ends", "pirates driven off", ["travel", "combat"], [
    "the pirate captain jumps overboard and swims back to his ship",
    "their ship turns away and sails into the fog",
    "the crew cheers",
    "i help the ship's doctor with the wounded",
  ], ["travel", "unknown"], ["calm", "tense"]),
  talk("combat ends", "looting with dice talk", ["wilderness", "combat"], [
    "the troll burns and stops moving",
    "okay that's combat done",
    "can i roll investigation to search the troll's lair",
    "sure. fourteen. you find a sack with some coins and a silver ring",
  ], ["wilderness", "unknown"], ["calm"]),
  talk("combat ends", "vampire turned to dust", ["interior", "combat"], [
    "i drive the stake into his heart",
    "he screams and crumbles into dust",
    "the mayor's manor is silent",
    "let's check upstairs for the missing kids",
  ], ["interior", "unknown"], ["calm", "tense"]),
  talk("combat ends", "thugs run away", ["town", "combat"], [
    "the last two thugs look at their friends on the ground and run",
    "do i chase them",
    "nah let them go",
    "we pick up the dropped purse and head back to the inn",
  ], ["town", "unknown"], ["calm"]),
  talk("combat ends", "enemies dead but danger remains", ["dungeon", "combat"], [
    "the last kobold falls",
    "but you can hear drums deeper in the cave, lots of them",
    "we should get out of here before more come",
    "quietly, back the way we came",
  ], ["dungeon", "unknown"], ["tense"]),
  talk("combat ends", "healing up Web Speech", ["town", "combat"], [
    "OK they're all down",
    "I cast cure wounds on the fighter",
    "Thanks I'm back up to twenty",
    "Let's search the cultists and see what they had on them",
  ], ["town", "unknown"], ["calm"]),
  talk("combat ends", "guards captured", ["interior", "combat"], [
    "the last guard drops his halberd and kneels",
    "i tie him up with the curtain cord",
    "the duke is unconscious in his chair",
    "okay let's find the vault before anyone else comes",
  ], ["interior", "unknown"], ["tense", "calm"]),
  talk("combat ends", "after the ambush, burying the dead", ["travel", "combat"], [
    "the last bandit falls off his horse",
    "it's over. two of the merchants were killed",
    "we bury them by the side of the road",
    "the caravan master thanks you and says we should keep moving",
  ], ["travel", "unknown"], ["calm"]),
  talk("combat ends", "spider nest cleared", ["dungeon", "combat"], [
    "i stab the last spider and it curls up",
    "that's all of them",
    "i'm going to burn the webs and the eggs",
    "you burn them. the tunnel ahead is clear",
  ], ["dungeon", "unknown"], ["calm", "tense"]),
  talk("combat ends", "fight over, talking to the rescued", ["wilderness", "combat"], [
    "with the gnolls dead you untie the prisoners",
    "a young woman thanks you, she's the miller's daughter",
    "we'll take you home, are you hurt",
    "she says she's fine, just hungry",
  ], ["wilderness", "unknown"], ["calm"]),
  talk("combat ends", "short: last enemy killed", ["dungeon", "combat"], [
    "you killed the last enemy",
  ], ["dungeon", "unknown"], ["calm", "tense"]),
  talk("combat ends", "GM ends combat, then levelling up", ["dungeon", "combat"], [
    "okay the lich is defeated, that's the end of combat",
    "and you all level up",
    "yes! i get my fourth level spells",
    "let's take a quick break and then you can look around the tower",
  ], ["dungeon", "unknown"], ["calm"]),
  talk("combat ends", "enemy flees, party wary", ["wilderness", "combat"], [
    "the assassin throws down a smoke bomb and disappears",
    "is he gone",
    "you can't see him anywhere",
    "he could still be out there, we stay on guard and keep our weapons out",
  ], ["wilderness", "unknown"], ["tense"]),
  talk("combat ends", "fight over Web Speech short lines", ["tavern", "combat"], [
    "That's the last one",
    "Combat's over",
    "I want to talk to the barkeep",
  ], ["tavern", "unknown"], ["calm"]),
  talk("combat ends", "won, now shopping talk", ["town", "combat"], [
    "the dragon's dead and the town's saved",
    "the mayor gives you a reward of five hundred gold",
    "i want to spend it all on a new sword",
    "the blacksmith will be open in the morning",
  ], ["town", "unknown"], ["calm"]),
];
