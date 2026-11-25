# Huangxiangru's Lab Westlake University

[打开高清交互演示](https://raconiy.github.io/westlake-plant-growth-studio/)

四部植物生长短片展示玫瑰、牡丹、水仙和番红花从出土、展叶、结苞到绽放的过程。每部影片有 65 个原生生成帧，分辨率 1280 × 720，按每秒 8 帧播放。

[![四个物种的展叶与开花画面](growth.jpg)](https://raconiy.github.io/westlake-plant-growth-studio/)

- **看生长**　选择物种，拖动胶片或点选生长阶段。
- **调花期**　拖动「开花时刻」即可预览同一段成片早开或晚开的效果。此操作在浏览器里重排播放时间。
- **看资产**　切换到「4D 资产」并拖动以旋转程序生成的几何。切换到「控制图」可查看生成影片使用的结构条件。

单独查看高清影片：[玫瑰](media/rose/film.mp4) · [牡丹](media/peony/film.mp4) · [水仙](media/daffodil/film.mp4) · [番红花](media/crocus/film.mp4)。

影片使用程序化逐株几何、配对实拍视频训练的 Wan2.1-VACE-1.3B LoRA 和模型生成的环境。四个示例使用同一个种子 43。公开演示在浏览器里播放预生成影片、渲染时序网格。新的 prompt 生成任务在实验室 GPU 服务器上运行。

## 本地查看

在分支根目录运行 `python3 -m http.server 8000`，然后打开 [本地演示](http://localhost:8000/)。
