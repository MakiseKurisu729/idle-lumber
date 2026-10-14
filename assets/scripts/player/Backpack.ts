import { _decorator, Component, Node } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 背包：最多同时装 2 个"位置"——每种木材类型占 1 个位置，金币占 1 个位置。
 * 同类型不限量堆叠；木材列在前、金币列永远排在木材列后面。
 * 物品的位置/旋转全部由背包统一安排（_rearrange）。
 */
@ccclass('Backpack')
export class Backpack extends Component {

    @property(Node)
    carryPoint: Node = null;

    private _woods: Node[] = [];
    private _coins: Node[] = [];
    private _incoming: number = 0;   // 正在飞往背包的数量（先占坑，防止索引撞车）

    get count(): number { return this._woods.length; }
    get isEmpty(): boolean { return this._woods.length === 0; }
    get coinCount(): number { return this._coins.length; }
    get incoming(): number { return this._incoming; }

    /** 先占 n 个坑：飞行途中的物品也计入堆叠索引 */
    reserveIncoming(n: number) {
        this._incoming += n;
    }

    // ========== 类型限制：木头类型 + 金币，最多占 2 个位置 ==========

    private _typeOf(node: Node): string {
        const i = node.name.indexOf('_');
        return i >= 0 ? node.name.slice(0, i + 1) : node.name;
    }

    private _currentTypes(): string[] {
        const types: string[] = [];
        for (const w of this._woods) {
            if (!w || !w.isValid) continue;
            const t = this._typeOf(w);
            if (types.indexOf(t) < 0) types.push(t);
        }
        return types;
    }

    /** 已占用的位置数：木头类型数 + 金币（有金币占 1 位） */
    private _usedSlots(): number {
        return this._currentTypes().length + (this._coins.length > 0 ? 1 : 0);
    }

    /** 还能不能装这种木头 */
    canAddType(prefix: string): boolean {
        const types = this._currentTypes();
        if (types.indexOf(prefix) >= 0) return true;   // 已有类型不限量
        return this._usedSlots() < 2;
    }

    canAdd(node: Node): boolean {
        return this.canAddType(this._typeOf(node));
    }

    /** 还能不能捡金币（金币也占一个位置） */
    canAddCoin(): boolean {
        if (this._coins.length > 0) return true;      // 已有金币类型，不限量
        return this._currentTypes().length < 2;       // 没有金币时，要占一个新位置
    }

    // ========== 木头放入 / 取出 ==========

    /** 飞行落地后放入（配合 reserveIncoming 消耗一个坑） */
    addWoodAnimated(woodNode: Node): void {
        this._woods.push(woodNode);
        this._incoming = Math.max(0, this._incoming - 1);
        this._rearrange();
    }

    addWood(woodNode: Node): void {
        this._woods.push(woodNode);
        this._rearrange();
    }

    takeWood(prefix: string | null = null): Node | null {
        if (this.isEmpty) return null;

        let index = this._woods.length - 1;

        if (prefix) {
            index = -1;
            for (let i = this._woods.length - 1; i >= 0; i--) {
                const w = this._woods[i];
                if (w && w.isValid && w.name.startsWith(prefix)) {
                    index = i;
                    break;
                }
            }
            if (index < 0) return null;
        }

        const wood = this._woods.splice(index, 1)[0];
        this._rearrange();
        return wood;
    }

    // ========== 金币放入 / 取出（位置由背包统一安排） ==========

    addCoin(coin: Node): void {
        this._coins.push(coin);
        this._rearrangeCoins();
    }

    takeCoin(): Node | null {
        if (this._coins.length === 0) return null;
        const coin = this._coins.pop()!;
        this._rearrangeCoins();
        return coin;
    }

    // ========== 重排 ==========

    private _rearrange() {
        const types: string[] = [];
        const typeCounts: { [key: string]: number } = {};

        for (const w of this._woods) {
            if (!w || !w.isValid) continue;
            const t = this._typeOf(w);
            if (types.indexOf(t) < 0) types.push(t);

            const col = types.indexOf(t);
            const idx = typeCounts[t] || 0;
            typeCounts[t] = idx + 1;

            // 第一种 z = -0.4，第二种 z = -0.9（往后错 0.5）
            w.setPosition(0, idx * 0.35, -0.4 - col * 0.5);
            w.setRotationFromEuler(0, 90, 0);
        }

        // 木头类型变了，金币列的位置也要跟着挪
        this._rearrangeCoins();
    }

    private _rearrangeCoins() {
        const col = this._currentTypes().length;   // 金币列永远排在木材列后面
        for (let i = 0; i < this._coins.length; i++) {
            const c = this._coins[i];
            if (!c || !c.isValid) continue;
            c.setPosition(0, i * 0.12, -0.4 - col * 0.5);
            c.setRotationFromEuler(0, 0, 0);
        }
    }
}
