// Card data types based on schema.md

export type CardType = 'monster' | 'spell' | 'trap';

export type Attribute = 'dark' | 'divine' | 'earth' | 'fire' | 'light' | 'water' | 'wind';

export type LevelType = 'level' | 'rank' | 'link';

export type Race = 
  | 'aqua' | 'beast' | 'beastwarrior' | 'creatorgod' | 'cyberse' 
  | 'dinosaur' | 'divine' | 'dragon' | 'fairy' | 'fiend' | 'fish' 
  | 'illusion' | 'insect' | 'machine' | 'plant' | 'psychic' | 'pyro' 
  | 'reptile' | 'rock' | 'seaserpent' | 'spellcaster' | 'thunder' 
  | 'warrior' | 'windbeast' | 'wyrm' | 'zombie';

export type MonsterType = 
  | 'normal' | 'effect' | 'fusion' | 'ritual' | 'synchro' 
  | 'xyz' | 'link' | 'pendulum' | 'tuner' | 'spirit' 
  | 'union' | 'gemini' | 'flip' | 'toon' | 'special';

export type SpellEffectType = 'normal' | 'quick' | 'continuous' | 'equip' | 'field' | 'ritual';

export type TrapEffectType = 'normal' | 'continuous' | 'counter';

export type LinkMarker = 
  | 'top' | 'bottom' | 'left' | 'right' 
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * Main card interface representing a card from cards-all.tsv
 */
export interface Card {
  cardType: CardType;
  name: string;
  nameModified: string;
  ruby: string;
  cardId: string;
  ciid?: string;
  imgs?: string; // JSON array as string
  text?: string;
  
  // Monster-specific fields
  attribute?: Attribute;
  levelType?: LevelType;
  levelValue?: string;
  race?: Race;
  monsterTypes?: string; // JSON array as string
  atk?: string;
  def?: string;
  linkMarkers?: string; // JSON array as string
  pendulumScale?: string;
  pendulumText?: string;
  isExtraDeck?: string; // "true" or empty
  
  // Spell-specific fields
  spellEffectType?: SpellEffectType;
  
  // Trap-specific fields
  trapEffectType?: TrapEffectType;
}

/**
 * Detail information from detail-all.tsv
 */
export interface CardDetail {
  cardId: string;
  cardName: string;
  supplementInfo?: string;
  supplementDate?: string;
  pendulumSupplementInfo?: string;
  pendulumSupplementDate?: string;
}

/**
 * Pattern types for card name extraction
 */
export type PatternType = 'flexible' | 'exact' | 'cardId';

/**
 * Extracted pattern with metadata
 */
export interface ExtractedPattern {
  pattern: string;
  type: PatternType;
  query: string;
  startIndex?: number;
}

/**
 * Card match result from search
 */
export interface CardMatch {
  pattern: string;
  type: PatternType;
  query: string;
  results: Card[];
}

/**
 * Replacement status
 */
export type ReplacementStatus = 'resolved' | 'multiple' | 'notfound' | 'already_processed';

/**
 * Replacement result
 */
export interface ReplacementResult {
  processedText: string;
  hasUnprocessed: boolean;
  warnings: string[];
  processedPatterns: Array<{
    original: string;
    replaced: string;
    status: ReplacementStatus;
  }>;
}
