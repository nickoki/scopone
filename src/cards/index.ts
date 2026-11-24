/**
 * Original SVG artwork for the 40-card Italian deck in three regional styles.
 *
 * Every card is drawn in a 100 x 170 viewBox and scales to fill its parent.
 */
import { CARD_H, CARD_W } from './themes';

export type { CardStyle } from './themes';
export { CARD_STYLES } from './themes';
export { CardFace, CardBack, SuitIcon } from './CardFace';
export type { CardFaceProps, CardBackProps, SuitIconProps } from './CardFace';

/** width / height of every card (100 / 170). */
export const CARD_ASPECT: number = CARD_W / CARD_H;
