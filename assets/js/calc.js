// Pure calculation module (USD). Exported for reuse and testing.
export function calculateIncome(wordCount, subscribers, privilegeCoins, giftCoins, mgs, winwinTier) {
    // coin price/value by word count
    let coinPrice, coinValue;
    if (wordCount <= 1200) { coinPrice = 10; coinValue = 0.005100; }
    else if (wordCount <= 1400) { coinPrice = 12; coinValue = 0.005100; }
    else if (wordCount <= 1600) { coinPrice = 13; coinValue = 0.004715; }
    else if (wordCount <= 1800) { coinPrice = 15; coinValue = 0.004544; }
    else if (wordCount <= 2000) { coinPrice = 16; coinValue = 0.0047875; }
    else if (wordCount <= 2200) { coinPrice = 18; coinValue = 0.004862; }
    else if (wordCount <= 2400) { coinPrice = 20; coinValue = 0.0043457; }
    else if (wordCount <= 2600) { coinPrice = 21; coinValue = 0.00414163; }
    else { coinPrice = 23; coinValue = 0.004447826; }

    const rawSub = coinPrice * coinValue * subscribers;
    const finalSub = rawSub > 200 ? rawSub : rawSub * 0.9;
    const privilegeIncome = privilegeCoins * 0.004936;
    const giftIncome = giftCoins * 0.004736;

    const base = finalSub + privilegeIncome + giftIncome;

    // Win-Win bonus (flat add)
    const winWin = winwinTier === 'tier1' ? 50
        : winwinTier === 'tier2' ? 200
            : winwinTier === 'tier3' ? 400
                : 0;

    // MGS rules you approved
    let mgsBonus = 0;
    if (base < 60) {
        mgsBonus = 0;
    } else if (base < 200) {
        mgsBonus = (mgs === 'yes') ? (200 - base) : 0;
    } else {
        mgsBonus = (mgs === 'yes') ? 200 : 0;
    }

    const total = base + winWin + mgsBonus;

    // return detail for UI
    return {
        totalUSD: total,
        finalSubUSD: finalSub,
        privilegeUSD: privilegeIncome,
        giftUSD: giftIncome,
        mgsUSD: mgsBonus,
        winwinUSD: winWin,
        baseUSD: base
    };
}
