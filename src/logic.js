export const FARM_STATS = [
    { lvl: 0, cost: 300,  total: 300,  inc: 60,   upg: 300,  diff: 60,  name: 'Lvl 0' },
    { lvl: 1, cost: 200,  total: 500,  inc: 100,  upg: 200,  diff: 40,  name: 'Lvl 1' },
    { lvl: 2, cost: 600,  total: 1100, inc: 225,  upg: 600,  diff: 125, name: 'Lvl 2' },
    { lvl: 3, cost: 1250, total: 2350, inc: 500,  upg: 1250, diff: 275, name: 'Lvl 3' },
    { lvl: 4, cost: 2500, total: 4850, inc: 900,  upg: 2500, diff: 400, name: 'Lvl 4' },
    { lvl: 5, cost: 4500, total: 9350, inc: 1500, upg: 4500, diff: 600, name: 'Lvl 5 MAX' }
];

export function runSimulation(startWave, targetWave, startCash, targetCash, initialFarms, isWaveRewardsActive, waveRewardsData) {
    let farms = [...initialFarms];
    let cash = startCash;
    let history = [];
    let totalIncomeGenerated = 0;

    for (let w = startWave + 1; w < targetWave; w++) {
        let wavesLeft = targetWave - w;
        let waveRewardAmount = 0;
        if (isWaveRewardsActive && (w - 1) >= 1 && (w - 1) <= waveRewardsData.length) {
            waveRewardAmount = waveRewardsData[w - 2] || 0;
        } else if (isWaveRewardsActive && w === startWave + 1 && startWave >= 1) {
            waveRewardAmount = waveRewardsData[startWave - 1] || 0;
        }
        cash += waveRewardAmount;
        let currentFarmInc = farms.reduce((sum, lvl) => sum + FARM_STATS[lvl].inc, 0);
        let futureWaveRewardsSum = 0;
        if (isWaveRewardsActive) {
            for (let k = w; k < targetWave; k++) {
                futureWaveRewardsSum += (waveRewardsData[k - 1] || 0);
            }
        }
        let projectedCashAtEnd = cash + (wavesLeft * currentFarmInc) + futureWaveRewardsSum;
        let actions = [];

        while (true) {
            if (projectedCashAtEnd >= targetCash) break;
            let candidates = [];
            for (let i = 0; i < farms.length; i++) {
                let lvl = farms[i];
                if (lvl < 5) {
                    let nextLvl = lvl + 1;
                    let info = FARM_STATS[nextLvl];
                    let netGain = (wavesLeft * info.diff) - info.upg;
                    if (cash >= info.upg && netGain > 0) {
                        candidates.push({ type: 'upg', farmIdx: i, targetLvl: nextLvl, cost: info.upg, netGain, roi: info.diff / info.upg, diff: info.diff });
                    }
                }
            }
            if (farms.length < 10) {
                let info = FARM_STATS[0];
                let netGain = (wavesLeft * info.diff) - info.upg;
                if (cash >= info.upg && netGain > 0) {
                    candidates.push({ type: 'buy', farmIdx: farms.length, targetLvl: 0, cost: info.upg, netGain, roi: info.diff / info.upg, diff: info.diff });
                }
            }
            if (candidates.length === 0) break;
            candidates.sort((a, b) => (b.netGain - a.netGain) || (b.roi - a.roi));
            let best = candidates[0];
            cash -= best.cost;
            if (best.type === 'upg') {
                farms[best.farmIdx] = best.targetLvl;
                actions.push(`Прокачать Ф#${best.farmIdx + 1} до Lvl ${best.targetLvl}`);
            } else {
                farms.push(0);
                actions.push(`+1x Ферма Lvl 0 (#${farms.length})`);
            }
            currentFarmInc = farms.reduce((sum, lvl) => sum + FARM_STATS[lvl].inc, 0);
            projectedCashAtEnd = cash + (wavesLeft * currentFarmInc) + futureWaveRewardsSum;
        }

        let waveFarmInc = farms.reduce((sum, lvl) => sum + FARM_STATS[lvl].inc, 0);
        totalIncomeGenerated += waveFarmInc + waveRewardAmount;
        cash += waveFarmInc;
        history.push({ wave: w, actions, income: waveFarmInc, waveReward: waveRewardAmount, cash, farmsSnapshot: [...farms] });
    }

    if (isWaveRewardsActive && (targetWave - 1) >= 1) {
        let lastWaveReward = waveRewardsData[targetWave - 2] || 0;
        cash += lastWaveReward;
        totalIncomeGenerated += lastWaveReward;
    }

    let pureCash = cash;
    let totalSellVal = farms.reduce((sum, lvl) => sum + Math.floor(FARM_STATS[lvl].total / 2), 0);
    let maxWealth = pureCash + totalSellVal;
    let needed = targetCash - pureCash;
    let sellsNeeded = [];
    let accumulatedSell = 0;

    if (needed > 0) {
        let farmItems = farms.map((lvl, idx) => ({ idx: idx + 1, lvl, total: FARM_STATS[lvl].total, sellVal: Math.floor(FARM_STATS[lvl].total / 2) })).sort((a, b) => a.sellVal - b.sellVal);
        for (let item of farmItems) {
            if (accumulatedSell < needed) {
                accumulatedSell += item.sellVal;
                sellsNeeded.push(item);
            }
        }
    }

    let cashWithSells = pureCash + accumulatedSell;
    let isRealizable = (pureCash >= targetCash) || (cashWithSells >= targetCash);
    let needsSelling = pureCash < targetCash && isRealizable;

    return { history, pureCash, cashWithSells, maxWealth, targetCash, isRealizable, needsSelling, sellsNeeded, accumulatedSell, totalIncomeGenerated, finalFarms: farms };
}

export function compactAggregateHistory(history) {
    if (!history || history.length === 0) return [];
    let aggregated = [];
    let i = 0, n = history.length;
    while (i < n) {
        let h = history[i], w = h.wave, acts = h.actions;
        if (acts.length === 0) {
            let startW = w, endW = w, endCash = h.cash, endInc = h.income, endReward = h.waveReward;
            while (i + 1 < n && history[i + 1].actions.length === 0) {
                i++; endW = history[i].wave; endCash = history[i].cash; endInc = history[i].income; endReward = history[i].waveReward;
            }
            aggregated.push({ waveText: (startW === endW) ? `${startW}` : `${startW}-${endW}`, isWait: true, actionText: "Накопление денег (Wait for money)", endCash, endInc, endReward });
            i++;
        } else {
            let startW = w, endW = w, endCash = h.cash, endInc = h.income, endReward = h.waveReward, actSummary = acts.join(", ");
            while (i + 1 < n && history[i + 1].actions.length > 0 && history[i + 1].actions.join(", ") === actSummary) {
                i++; endW = history[i].wave; endCash = history[i].cash; endInc = history[i].income; endReward = history[i].waveReward;
            }
            aggregated.push({ waveText: (startW === endW) ? `${startW}` : `${startW}-${endW}`, isWait: false, actionText: actSummary, endCash, endInc, endReward });
            i++;
        }
    }
    return aggregated;
}