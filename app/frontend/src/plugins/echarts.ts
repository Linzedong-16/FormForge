/**
 * ECharts 按需注册
 *
 * 集中在此注册本仪表盘用到的图表类型/组件，供各面板的 <VChart> 复用，
 * 避免每个面板重复调用 echarts.use()。
 */
import { use } from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import VChart from "vue-echarts";

use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

export { VChart };
