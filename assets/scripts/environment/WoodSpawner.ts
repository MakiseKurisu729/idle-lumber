import { _decorator, Component, Prefab, Node, instantiate, CCFloat } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 漂木生成器：定时在自身位置生成一根漂浮木头（带 Z 向随机偏移）。
 * 木头流出边界后由 FloatingWood 自己销毁。
 * （1.5 秒一根的频率不高，不走对象池——池化收益集中在高频物品上）
 */
@ccclass('WoodSpawner')
export class WoodSpawner extends Component {

    @property({ type: Prefab, tooltip: '漂浮木头预制体' })
    woodPrefab: Prefab = null;

    @property({ type: CCFloat, tooltip: '几秒生成一根' })
    spawnInterval: number = 1.5;

    @property({ type: Node, tooltip: '木头生成后的父节点（可选，默认是自己）' })
    spawnParent: Node = null;

    private _timer: number = 0;

    update(dt: number) {
        this._timer += dt;
        if (this._timer >= this.spawnInterval) {
            this._timer = 0;
            this._spawn();
        }
    }

    private _spawn() {
        if (!this.woodPrefab) return;

        const woodNode = instantiate(this.woodPrefab);

        // 在生成器位置生成，加一点 Z 向随机偏移
        const pos = this.node.position.clone();
        pos.z += (Math.random() - 0.5) * 10;
        woodNode.setPosition(pos);

        woodNode.setParent(this.spawnParent || this.node);
    }
}
