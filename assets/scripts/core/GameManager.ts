import { _decorator, Component, Label, CCFloat } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 全局管理器（单例）：负责金币 UI 显示。
 * 注意：UI 数字永远从背包实际金币数同步（syncCoins），不做独立记账 —— 背包是唯一数据源。
 */
@ccclass('GameManager')
export class GameManager extends Component {

    private static _inst: GameManager | null = null;
    public static get instance(): GameManager | null { return GameManager._inst; }

    @property({ type: Label, tooltip: 'Canvas 里显示金币总数的 Label' })
    moneyLabel: Label = null;

    @property({ type: CCFloat, tooltip: '每枚金币的价值' })
    coinValue: number = 20;

    private _coinCount: number = 0;

    onLoad() {
        GameManager._inst = this;
        this._refresh();
    }

    get coinCount(): number { return this._coinCount; }

    /** 按背包实际金币数刷新 UI（唯一入口） */
    syncCoins(count: number) {
        this._coinCount = count;
        this._refresh();
    }

    private _refresh() {
        if (this.moneyLabel) this.moneyLabel.string = `${this._coinCount * this.coinValue}`;
    }
}
