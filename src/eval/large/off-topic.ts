import type { Scenario } from "../scenarios.js";
import { talk } from "./make.js";

/** Talk outside the story: rules, dice, food, scheduling, jokes. The scene should stay as it was. */
export const OFF_TOPIC_SET: Scenario[] = [
  // --- During calm ---
  talk("off-topic", "pizza order", ["tavern", "calm"], [
    "okay before we go on, who wants pizza",
    "i'll have a margherita",
    "can we get one with pineapple",
    "absolutely not. okay i'm ordering, it'll be forty minutes",
  ], ["tavern", "unknown"], ["calm"]),
  talk("off-topic", "scheduling next session", ["town", "calm"], [
    "are we playing next friday",
    "i can't do friday, i've got my sister's birthday",
    "how about saturday afternoon",
    "saturday works for me, let's do two o'clock",
  ], ["town", "unknown"], ["calm"]),
  talk("off-topic", "levelling up talk", ["wilderness", "calm"], [
    "wait, when do we level up",
    "after this next bit probably",
    "i want to take the sharpshooter feat",
    "that's going to be broken with your bow",
  ], ["wilderness", "unknown"], ["calm"]),
  talk("off-topic", "initiative rules question", ["interior", "calm"], [
    "how does initiative work again",
    "you roll a d20 and add your dex modifier",
    "and ties go to whoever has the higher dex",
    "got it, thanks",
  ], ["interior", "unknown"], ["calm"]),
  talk("off-topic", "do we roll for initiative question", ["tavern", "calm"], [
    "if we start a fight here do we all roll initiative or just the ones fighting",
    "everyone rolls",
    "okay, i was just wondering",
  ], ["tavern", "unknown"], ["calm"]),
  talk("off-topic", "film chat", ["travel", "calm"], [
    "did anyone see the new dune film",
    "yeah it was amazing, the sound in the cinema was insane",
    "i fell asleep in the first one",
    "okay okay, back to the game",
  ], ["travel", "unknown"], ["calm"]),
  talk("off-topic", "character sheet fixing Web Speech", ["town", "calm"], [
    "Hang on my character sheet is wrong",
    "My armour class should be sixteen not fourteen",
    "Did you add your shield",
    "Oh no I didn't",
  ], ["town", "unknown"], ["calm"]),
  talk("off-topic", "toilet break", ["dungeon", "calm"], [
    "can we take five minutes",
    "yeah good idea, toilet break",
    "anyone want a tea while the kettle's on",
    "milk and two sugars please",
  ], ["dungeon", "unknown"], ["calm"]),
  talk("off-topic", "talking about a fight in another game", ["tavern", "calm"], [
    "last week in my other group we fought a beholder",
    "it disintegrated our paladin in the first round",
    "brutal, did you win",
    "barely, the wizard was the only one standing",
  ], ["tavern", "unknown"], ["calm"]),
  talk("off-topic", "dice superstition", ["town", "calm"], [
    "this d20 is cursed, it keeps rolling ones",
    "put it in dice jail",
    "i'm using my lucky one from now on",
    "you said that last week",
  ], ["town", "unknown"], ["calm"]),
  talk("off-topic", "spell lookup", ["interior", "calm"], [
    "what does guidance actually do",
    "you touch someone and they add a d4 to one ability check",
    "is it concentration",
    "yeah it's concentration, up to a minute",
  ], ["interior", "unknown"], ["calm"]),
  talk("off-topic", "short: snack talk", ["wilderness", "calm"], [
    "pass the crisps please",
  ], ["wilderness", "unknown"], ["calm"]),

  // --- During tense ---
  talk("off-topic", "rules check while sneaking", ["dungeon", "tense"], [
    "wait can i use stealth while i'm carrying the torch",
    "no, a torch is going to give you away",
    "okay i'll put it out",
    "does everyone have darkvision except me",
  ], ["dungeon", "unknown"], ["tense"]),
  talk("off-topic", "phone call during the standoff", ["tavern", "tense"], [
    "sorry, it's my mum, i have to take this",
    "we'll wait",
    "while she's on the phone does anyone want more drinks",
    "i'll have another beer",
  ], ["tavern", "unknown"], ["tense"]),
  talk("off-topic", "joking during the chase Web Speech", ["town", "tense"], [
    "This is like that scene in Indiana Jones",
    "Except Indiana Jones didn't fall off the roof",
    "I only rolled a three that's not my fault",
    "It literally is your fault",
  ], ["town", "unknown"], ["tense"]),
  talk("off-topic", "what's my passive perception", ["wilderness", "tense"], [
    "what's my passive perception",
    "ten plus your wisdom modifier plus proficiency",
    "so fifteen",
    "yep fifteen",
  ], ["wilderness", "unknown"], ["tense"]),
  talk("off-topic", "debating a plan out of character", ["interior", "tense"], [
    "out of character, do you think the butler is in on it",
    "definitely, he was so shifty",
    "we should have checked his room earlier",
    "let's decide what we're doing, the guards are still outside",
  ], ["interior", "unknown"], ["tense"]),

  // --- During combat ---
  talk("off-topic", "pizza arrives mid fight", ["dungeon", "combat"], [
    "pizza's here",
    "okay let's pause the fight for food",
    "who had the pepperoni",
    "me, and can someone grab the garlic bread",
  ], ["dungeon", "unknown"], ["combat"]),
  talk("off-topic", "rules argument mid fight", ["wilderness", "combat"], [
    "you can't cast two levelled spells in one turn",
    "i'm not, the bonus action one is a cantrip",
    "then it's fine, healing word plus a cantrip is allowed",
    "can you check the rule just in case",
  ], ["wilderness", "unknown"], ["combat"]),
  talk("off-topic", "player late mid fight", ["town", "combat"], [
    "oh hi, come in, we're in the middle of a fight",
    "sorry i'm late, the trains were awful",
    "your character's been fighting on autopilot",
    "grab a chair, you're up after the goblins",
  ], ["town", "unknown"], ["combat"]),
  talk("off-topic", "dice maths mid fight Web Speech", ["tavern", "combat"], [
    "Is it two d6 plus four or two d6 plus six",
    "With great weapon fighting you reroll ones and twos",
    "OK so eleven",
    "Eleven yeah",
  ], ["tavern", "unknown"], ["combat"]),
  talk("off-topic", "music too loud mid fight", ["dungeon", "combat"], [
    "can you turn the music down a bit",
    "is that better",
    "yeah thanks, i couldn't hear the dm",
    "okay where were we, it's the ogre's turn",
  ], ["dungeon", "unknown"], ["combat"]),
  talk("off-topic", "short: break mid fight", ["dungeon", "combat"], [
    "let's take a quick break before the next round",
  ], ["dungeon", "unknown"], ["combat"]),

  // --- During travel ---
  talk("off-topic", "map drawing chat", ["travel", "calm"], [
    "who's drawing the map",
    "i am, but my handwriting is awful",
    "is that a mountain or a cat",
    "it's a mountain, obviously",
  ], ["travel", "unknown"], ["calm"]),
  talk("off-topic", "talking about the real weather", ["travel", "calm"], [
    "it's actually raining really hard outside",
    "good thing we're inside",
    "i walked here, i'm soaked",
    "there's a towel in the bathroom",
  ], ["travel", "unknown"], ["calm"]),
  talk("off-topic", "work talk Web Speech", ["wilderness", "calm"], [
    "How's the new job going",
    "It's OK lots of meetings",
    "Same here",
    "OK let's get back to it",
  ], ["wilderness", "unknown"], ["calm"]),

  // --- Mentions of fights and danger that aren't happening ---
  talk("off-topic", "recap of last session's fight", ["town", "calm"], [
    "okay quick recap, last time you fought the goblins at the bridge",
    "the fighter nearly died and the wizard set the bridge on fire",
    "you rested and walked into town",
    "and you're now standing in the market square",
  ], ["town", "unknown"], ["calm"]),
  talk("off-topic", "planning a fight", ["tavern", "calm"], [
    "when we attack the camp tomorrow i'll go in first",
    "and i'll cast sleep on the guards",
    "what if they have archers",
    "then we fight them, we've got the numbers",
  ], ["tavern", "unknown"], ["calm"]),
  talk("off-topic", "telling a war story in character", ["tavern", "calm"], [
    "my character tells the farmers about the battle of the red pass",
    "she says the dragons came at dawn and the sky was full of fire",
    "the farmers look terrified",
    "she laughs and says that was twenty years ago, drink up",
  ], ["tavern", "unknown"], ["calm"]),
  talk("off-topic", "talking about the boss coming up", ["travel", "calm"], [
    "i really hope we don't have to fight the dragon",
    "we're level four, it would kill us",
    "so we need a plan to sneak in",
    "or we just don't go",
  ], ["travel", "unknown"], ["calm"]),
];
