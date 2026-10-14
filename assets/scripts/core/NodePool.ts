import { Node, Prefab, instantiate, Tween } from 'cc';

/**
 * 通用对象池（静态工具类，全局共用）。
 *
 * 用法：
 *   取：NodePool.get(预制体) —— 池里有就复用，没有才实例化
 *   还：NodePool.put(节点)   —— 代替 destroy()，节点回池待复用
 *
 * 约定：
 * - 谁取用，谁负责初始化（位置/旋转等）；
 * - put 时会掐掉节点上没播完的 tween，防止回收后残影；
 * - 只池高频对象（原木/圆木/木板/金币），低频对象（卡车、漂木）正常销毁。
 */
export class NodePool {

    private static _pools: Map<Prefab, Node[]> = new Map();
    private static _nodePrefab: Map<Node, Prefab> = new Map();

    /** 从池里取一个节点（代替 instantiate） */
    public static get(prefab: Prefab): Node {
        let pool = this._pools.get(prefab);
        if (!pool) {
            pool = [];
            this._pools.set(prefab, pool);
        }

        let node: Node;
        if (pool.length > 0) {
            node = pool.pop()!;
            node.active = true;
        } else {
            node = instantiate(prefab);
        }
        this._nodePrefab.set(node, prefab);
        return node;
    }

    /** 回收节点（代替 destroy）。不是从池里拿的节点会正常销毁 */
    public static put(node: Node) {
        if (!node || !node.isValid) return;

        const prefab = this._nodePrefab.get(node);
        if (!prefab) {
            node.destroy();   // 非池对象，走正常销毁
            return;
        }

        Tween.stopAllByTarget(node);   // 防止带着没播完的飞行动画回池
        node.removeFromParent();
        node.active = false;

        let pool = this._pools.get(prefab);
        if (!pool) {
            pool = [];
            this._pools.set(prefab, pool);
        }
        pool.push(node);
    }
}
