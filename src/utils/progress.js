const cliProgress = require('cli-progress');

class Progress {
    /**
     * @param {Object} stepWeights 步骤权重，键为步骤名，值为权重（总和应为1）
     * @param {string} [barFormat] 自定义进度条格式
     */
    constructor(stepWeights, barFormat = null) {
        this.stepWeights = { ...stepWeights };
        // Object.values() 静态方法返回一个给定对象的自有可枚举字符串键属性值组成的数组。
        // reduce() 方法对数组中的每个元素按序执行一个提供的 reducer 函数，每一次运行 reducer 会将先前元素的计算结果作为参数传入，最后将其结果汇总为单个返回值。
        this.totalWeight = Object.values(this.stepWeights).reduce((sum, w) => sum + w, 0);

        // 处理权重总和为 0 的情况
        if (this.totalWeight === 0) {
            throw new Error('步骤权重总和不能为0，请至少设置一个正权重');
        }

        if (Math.abs(this.totalWeight - 1) > 0.01) {
            // 步骤权重总和不为1，已自动归一化
            for (let key in this.stepWeights) {
                this.stepWeights[key] /= this.totalWeight;
            }
            // 归一化后权重和应为 1，更新 totalWeight 避免误导
            this.totalWeight = 1;
        }

        this.bar = new cliProgress.SingleBar({
            // 进度条输出格式。可以使用内置占位符自定义进度条，它们可以任意顺序组合。bar：进度条；percentage：当前进度百分比 (0-100)；
            // 此外，还可以自定义Payload，比如stepName，需要在start、update方法中传入
            format: barFormat || '总进度：{bar} {percentage}%，当前任务：{stepName}',
            barCompleteChar: '█',   // 用于条形图中的"完成"指示符的字符（默认："="）
            barIncompleteChar: '░', // 用于条形图中的"未完成"指示符的字符（默认："-")
            hideCursor: true        // 在进度操作期间隐藏光标；在完成后恢复（默认：false）- 传递 null 以保持终端设置
        }, cliProgress.Presets.shades_classic);  // 默认预设。shades_classic：条形图使用 Unicode 背景阴影

        this.accumulatedWeight = 0;
        this.currentStepName = '';
        this._started = false;   // 内部标志，防止重复 start
    }

    /**
     * 开始整体进度（必须在所有步骤之前调用一次）
     */
    start() {
        if (this._started) {  // 进度条已经启动，忽略重复调用 start()            
            return;
        }
        this._started = true;
        this.bar.start(100, 0, { stepName: '准备中' });     // 启动进度条并设置总数和初始值
    }

    /**
     * 执行一个步骤，自动更新总进度
     * @param {string} stepName 步骤名称（需与权重中的键一致）
     * @param {Function} stepFn 步骤函数，签名为 async (onStepProgress) => any
     *                          onStepProgress 接受 0~1 的步骤内部进度
     * @returns {Promise<any>} stepFn 的返回值
     */
    async runStep(stepName, stepFn) {
        if (!this._started) {
            throw new Error('请先调用 start() 方法启动进度条');
        }

        const weight = this.stepWeights[stepName];
        if (weight === undefined) {
            throw new Error(`步骤 "${stepName}" 未定义权重`);
        }

        this.currentStepName = stepName;
        // 设置当前进度值并可选地使用第二个参数设置包含自定义标记值的payload。若仅更新payload，请将 currentValue 设置为 null 。
        this.bar.update(this.accumulatedWeight * 100, { stepName });

        let stepCompleted = false;  // 防止步骤完成后回调继续更新进度

        const onStepProgress = (stepInternalProgress) => {
            if (stepCompleted) return; // 步骤已完成，忽略后续回调
            // 确保传入的进度值在 [0, 1] 区间
            const clampedProgress = Math.min(1, Math.max(0, stepInternalProgress));
            const totalProgress = this.accumulatedWeight + clampedProgress * weight;
            const newPercent = Math.min(100, Math.max(0, totalProgress * 100));
            this.bar.update(newPercent, { stepName });
        };

        let result;
        try {
            result = await stepFn(onStepProgress);
        } finally {
            // 无论成功或失败，都标记步骤已完成，避免残留回调更新（但不累加失败步骤的权重）
            stepCompleted = true;
        }

        // 步骤成功完成，累加权重并更新进度
        this.accumulatedWeight += weight;
        this.bar.update(this.accumulatedWeight * 100, { stepName: `${stepName} (完成)` });
        return result;
    }

    /**
     * 结束整体进度，停止进度条
     */
    stop() {
        if (!this._started) {
            return;
        }
        this.bar.stop();  // 停止进度条并转到下一行
        this._started = false;  // 允许重新 start（但需新建实例更安全，此处仅为防御）
    }
}

module.exports = { Progress };