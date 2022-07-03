import { InternalServerErrorException } from '@nestjs/common';
import type { Card, Rank, Suit } from '@poker-moons/shared/type';
import type { HandCategory, PlayerWithHand, RankHandReponse } from '../winner-determiner.types';

/**
 * Assigns a score to a hand based on which category it falls under and the value/rank of each card
 * involved in making the category + the kicker in cases where a tie is possible
 *
 * - Categories -
 * Royal Flush - 1000
 * Straight Flush - 900
 * 4 of a kind - 800
 * Full House - 700
 * Flush - 600
 * Straight - 500
 * 3 of a kind - 400
 * Two Pairs - 300
 * Pair - 200
 * High Card - 100
 *
 *
 * @example
 *
 * Hand1 = 4 of clubs, 4 of diamonds, 7 of hearts, 2 of clubs, and 9 of spades
 * Hand2 = 4 of spades, 4 of hearts, 7 of hearts, 2 of clubs, and 11 of spades
 *
 * In this case the category for both hands would be 'Pair' which is given a score of 200
 *
 * Hand1 and Hand2 both have a pair of 4s, so the winning score comes down to the kicker
 *
 * Score for Hand1 = 200 + 4 + 4 + 9 = 217
 * Score for Hand2 = 200 + 4 + 4 + 11 = 219
 */
export function rankHand(player: PlayerWithHand): RankHandReponse {
    // This should never happen, just done to satisfy TS
    if (player.hand === null) {
        throw new InternalServerErrorException('Attempting to rank a non-existant hand!');
    }

    // Using a zero index, the ten card will be at index 8 (used to check for a royal flush)
    const TEN_CARD_POSITION = 8;

    const suits: Record<Suit, number> = { clubs: 0, diamonds: 0, hearts: 0, spades: 0 };
    const ranks: Record<Rank, number> = {
        '2': 0,
        '3': 0,
        '4': 0,
        '5': 0,
        '6': 0,
        '7': 0,
        '8': 0,
        '9': 0,
        '10': 0,
        '11': 0,
        '12': 0,
        '13': 0,
        '14': 0,
    };

    // Map out how many of each suit and value the player has
    player.hand.forEach((card) => {
        suits[card.suit] += 1;
        ranks[card.rank] += 1;
    });

    // Used when checking for a straight or a royal flush
    const firstCardIndex = Object.values(ranks).findIndex((index) => index === 1);

    // Map each category to true/false depending on whether the hand meets the criteria
    const categoryMap: Record<HandCategory, boolean> = {
        'royal flush': false,
        'straight flush': false,
        'four of a kind': Object.values(ranks).some((count) => count === 4),
        'full house': Object.values(ranks).filter(Boolean).length === 2,
        flush: Object.values(suits).some((count) => count === 5),
        straight:
            Object.values(ranks)
                .slice(firstCardIndex, firstCardIndex + 5)
                .filter((count) => count === 1).length === 5,
        'three of a kind': Object.values(ranks).some((count) => count === 3),
        'two pairs': Object.values(ranks).filter((count) => count === 2).length === 2,
        pair: Object.values(ranks).filter((count) => count === 2).length === 1,
        'high card': true,
        'win via fold': false,
    };

    categoryMap['straight flush'] = categoryMap.flush && categoryMap.straight;
    categoryMap['royal flush'] = categoryMap['straight flush'] && firstCardIndex === TEN_CARD_POSITION;

    let score = 0;
    let category: HandCategory = '' as HandCategory;

    // Determine the highest ranking category the hand falls under and the associated score
    Object.keys(categoryMap).every((key, index) => {
        score = 1000 - index * 100;
        category = key as HandCategory;
        return !categoryMap[key as HandCategory];
    });

    // Add the values of the cards to the score
    if (
        category === 'royal flush' ||
        category === 'straight flush' ||
        category === 'full house' ||
        category === 'flush' ||
        category === 'straight'
    ) {
        player.hand.forEach((card) => {
            score += parseInt(card.rank);
        });
    } else if (category === 'four of a kind') {
        score += parseInt(Object.keys(ranks).filter((key) => ranks[key as Rank] === 4)[0]) * 4;
    } else if (category === 'three of a kind') {
        score += parseInt(Object.keys(ranks).filter((key) => ranks[key as Rank] === 3)[0]) * 3;
    } else if (category === 'two pairs') {
        const keys = Object.keys(ranks).filter((key) => ranks[key as Rank] === 2);
        score += parseInt(keys[0]) * 2 + parseInt(keys[1]) * 2;
    } else if (category === 'pair') {
        score +=
            parseInt(
                Object.keys(ranks)
                    .filter((key) => ranks[key as Rank] === 2)
                    .reduce((a, b) => a + b),
            ) * 2;
    }

    // Add the rank of the highest card to the score, which acts as the kicker to break ties
    if (category === 'two pairs' || category === 'pair' || category === 'high card') {
        score += Math.max(
            ...Object.keys(ranks)
                .filter((key) => ranks[key as Rank] === 1)
                .map(Number),
        );
    }

    return { player, category, score };
}

/**
 * Sorts the player's hands in ranking order.
 *
 * If only one player is passed in, it means they have won as a result
 * of everyone else folding, so no ranking is necessary.
 *
 * @param players - the players and their hands to compare
 */
export function compareHands(players: PlayerWithHand[]): RankHandReponse[] {
    if (players.length === 1) {
        return [
            {
                player: players[0],
                category: 'win via fold',
                score: 10000,
            },
        ];
    }

    const sortedHands: RankHandReponse[] = players
        .map((player) => rankHand(player))
        .sort((handA, handB) => handB.score - handA.score);

    return sortedHands;
}

/**
 * A type guard to ensure that at the end of the round each player has two cards in their hand
 */
export const playerHasTwoCards = (playerCards: [Card, Card] | []): playerCards is [Card, Card] => {
    return playerCards.length === 2;
};

/**
 * A type guard to ensure that at the end of the round five cards are on the table
 */
export const tableHasFiveCards = (
    tableCards: [Card, Card, Card, Card, Card] | Card[],
): tableCards is [Card, Card, Card, Card, Card] => {
    return tableCards.length === 5;
};
