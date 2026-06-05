# Element Plus 组件二次封装为问卷高级组件分析报告

## 1. 引言

本文档基于 Element Plus 组件库的完整组件列表，分析哪些组件可以二次封装为问卷编辑器的高级组件，为项目扩展提供技术方案参考。

---

## 2. 可封装组件清单

### 2.1 表单输入类组件

#### 2.1.1 ElCascader → 多级联动题组件

**封装方案：**
```vue
<template>
  <el-cascader
    v-model="selectedValue"
    :options="options"
    :props="cascaderProps"
    :placeholder="placeholder"
    clearable
  />
</template>
```

**功能增强：**
- 支持省市区三级联动数据源
- 支持自定义层级配置
- 支持懒加载下级数据
- 支持数据格式化输出

**应用场景：**
- 地址选择（省/市/区）
- 产品分类选择
- 组织架构选择

**配置项：**
```typescript
interface CascadingQuestionConfig {
  dataSource: 'address' | 'custom'; // 数据源类型
  levels: number; // 联动层级数
  separator: string; // 分隔符
  lazyLoad: boolean; // 是否懒加载
  customData?: any[]; // 自定义数据
}
```

---

#### 2.1.2 ElSlider → 滑块题组件

**封装方案：**
```vue
<template>
  <div class="slider-question">
    <el-slider
      v-model="value"
      :min="min"
      :max="max"
      :step="step"
      :marks="marks"
      :show-tooltip="showTooltip"
    />
    <div class="slider-labels">
      <span>{{ minLabel }}</span>
      <span class="current-value">{{ value }}</span>
      <span>{{ maxLabel }}</span>
    </div>
  </div>
</template>
```

**功能增强：**
- 支持自定义刻度标记
- 支持步长设置
- 支持范围选择
- 支持实时数值显示
- 支持最小/最大值标签

**应用场景：**
- 价格敏感度测试
- 时间预估
- 预算范围选择
- 满意度连续评分

**配置项：**
```typescript
interface SliderQuestionConfig {
  min: number; // 最小值
  max: number; // 最大值
  step: number; // 步长
  minLabel?: string; // 最小值标签
  maxLabel?: string; // 最大值标签
  marks?: Record<number, string>; // 刻度标记
  showTooltip: boolean; // 显示提示
  range: boolean; // 是否范围选择
}
```

---

#### 2.1.3 ElUpload → 文件上传题组件

**封装方案：**
```vue
<template>
  <el-upload
    v-model:file-list="fileList"
    :action="uploadUrl"
    :accept="accept"
    :limit="limit"
    :max-size="maxSize"
    :before-upload="beforeUpload"
    :on-success="handleSuccess"
    :on-error="handleError"
    :on-exceed="handleExceed"
    drag
  >
    <el-icon class="el-icon--upload"><upload-filled /></el-icon>
    <div class="el-upload__text">
      拖拽文件到此处或 <em>点击上传</em>
    </div>
    <template #tip>
      <div class="el-upload__tip">
        {{ tipText }}
      </div>
    </template>
  </el-upload>
</template>
```

**功能增强：**
- 支持多种文件类型限制
- 支持文件大小限制
- 支持文件数量限制
- 支持拖拽上传
- 支持文件预览
- 支持上传进度显示

**应用场景：**
- 活动报名（上传证件照）
- 作业提交
- 资料收集
- 作品上传

**配置项：**
```typescript
interface FileUploadQuestionConfig {
  accept: string; // 接受的文件类型
  maxSize: number; // 最大文件大小（MB）
  limit: number; // 最大上传数量
  uploadUrl: string; // 上传地址
  tipText: string; // 提示文本
  allowMultiple: boolean; // 是否允许多文件
  preview: boolean; // 是否支持预览
}
```

---

#### 2.1.4 ElRate → NPS评分题组件

**封装方案：**
```vue
<template>
  <div class="nps-question">
    <el-rate
      v-model="score"
      :max="10"
      :texts="npsTexts"
      show-text
      :colors="npsColors"
    />
    <div class="nps-labels">
      <span class="detractor">贬损者 (0-6)</span>
      <span class="passive">被动者 (7-8)</span>
      <span class="promoter">推荐者 (9-10)</span>
    </div>
    <el-input
      v-if="showReason"
      v-model="reason"
      type="textarea"
      :placeholder="reasonPlaceholder"
      :rows="3"
    />
  </div>
</template>
```

**功能增强：**
- 标准 NPS 评分（0-10分）
- 自动分类（推荐者/被动者/贬损者）
- 支持后续追问开放题
- 支持颜色区分
- 自动计算 NPS 分值

**应用场景：**
- 客户满意度调查
- 用户忠诚度调研
- 产品体验反馈
- 员工满意度调研

**配置项：**
```typescript
interface NPSQuestionConfig {
  maxScore: number; // 最大分值（默认10）
  showReason: boolean; // 是否显示原因输入
  reasonPlaceholder: string; // 原因输入提示
  showLabels: boolean; // 是否显示分类标签
  customTexts?: string[]; // 自定义评分文本
  customColors?: string[]; // 自定义颜色
}
```

---

#### 2.1.5 ElTransfer → 排序题组件

**封装方案：**
```vue
<template>
  <div class="ranking-question">
    <el-transfer
      v-model="selectedItems"
      :data="items"
      :titles="['待排序', '已排序']"
      :button-texts="['移除', '添加']"
      :render-content="renderContent"
      filterable
    />
    <div class="ranking-order">
      <span>排序结果：</span>
      <el-tag
        v-for="(item, index) in selectedItems"
        :key="item.key"
        closable
        @close="removeItem(index)"
      >
        {{ index + 1 }}. {{ item.label }}
      </el-tag>
    </div>
  </div>
</template>
```

**功能增强：**
- 支持拖拽排序
- 支持上下移动按钮
- 支持排序数量限制
- 支持搜索过滤
- 支持排序结果展示

**应用场景：**
- 优先级排序
- 偏好调查
- 需求收集
- 功能重要性排序

**配置项：**
```typescript
interface RankingQuestionConfig {
  items: Array<{ key: string; label: string }>; // 排序项
  maxItems: number; // 最大排序数量
  minItems: number; // 最小排序数量
  allowDrag: boolean; // 允许拖拽排序
  showOrder: boolean; // 显示排序序号
  searchable: boolean; // 支持搜索
}
```

---

#### 2.1.6 ElTreeSelect → 树形选择题组件

**封装方案：**
```vue
<template>
  <el-tree-select
    v-model="selectedValue"
    :data="treeData"
    :props="treeProps"
    :multiple="multiple"
    :check-strictly="checkStrictly"
    :render-after-expand="false"
    placeholder="请选择"
    clearable
  />
</template>
```

**功能增强：**
- 支持单选/多选
- 支持父子关联选择
- 支持懒加载
- 支持自定义节点内容
- 支持搜索过滤

**应用场景：**
- 组织架构选择
- 产品分类选择
- 地区选择（多级）
- 技能标签选择

**配置项：**
```typescript
interface TreeSelectQuestionConfig {
  treeData: any[]; // 树形数据
  multiple: boolean; // 是否多选
  checkStrictly: boolean; // 父子不关联
  lazy: boolean; // 懒加载
  showCheckbox: boolean; // 显示复选框
  searchable: boolean; // 支持搜索
}
```

---

#### 2.1.7 ElSwitch → 开关题组件

**封装方案：**
```vue
<template>
  <div class="switch-question">
    <el-switch
      v-model="value"
      :active-text="activeText"
      :inactive-text="inactiveText"
      :active-color="activeColor"
      :inactive-color="inactiveColor"
    />
  </div>
</template>
```

**功能增强：**
- 支持自定义开关文本
- 支持自定义颜色
- 支持禁用状态
- 支持加载状态

**应用场景：**
- 同意/不同意条款
- 开启/关闭功能
- 是/否问题
- 启用/禁用选项

**配置项：**
```typescript
interface SwitchQuestionConfig {
  activeText: string; // 开启文本
  inactiveText: string; // 关闭文本
  activeColor: string; // 开启颜色
  inactiveColor: string; // 关闭颜色
  defaultValue: boolean; // 默认值
}
```

---

#### 2.1.8 ElInputNumber → 数字输入题组件

**封装方案：**
```vue
<template>
  <el-input-number
    v-model="value"
    :min="min"
    :max="max"
    :step="step"
    :precision="precision"
    :controls-position="controlsPosition"
    :placeholder="placeholder"
  />
</template>
```

**功能增强：**
- 支持最小/最大值限制
- 支持步长设置
- 支持小数精度
- 支持按钮位置配置
- 支持禁用状态

**应用场景：**
- 年龄输入
- 数量选择
- 金额输入
- 评分输入

**配置项：**
```typescript
interface InputNumberQuestionConfig {
  min: number; // 最小值
  max: number; // 最大值
  step: number; // 步长
  precision: number; // 小数位数
  controlsPosition: 'right' | ''; // 按钮位置
  placeholder: string; // 占位符
}
```

---

#### 2.1.9 ElInputTag → 标签输入题组件

**封装方案：**
```vue
<template>
  <el-input-tag
    v-model="tags"
    :placeholder="placeholder"
    :max-tags="maxTags"
    :allow-duplicate="allowDuplicate"
  />
</template>
```

**功能增强：**
- 支持标签输入
- 支持标签数量限制
- 支持去重设置
- 支持标签删除
- 支持自定义标签样式

**应用场景：**
- 技能标签输入
- 兴趣爱好输入
- 关键词输入
- 标签分类

**配置项：**
```typescript
interface InputTagQuestionConfig {
  maxTags: number; // 最大标签数量
  allowDuplicate: boolean; // 允许重复
  placeholder: string; // 占位符
  trigger: 'space' | 'enter'; // 触发方式
}
```

---

### 2.2 数据展示类组件

#### 2.2.1 ElTable → 矩阵题组件系列

**2.2.1.1 矩阵单选题组件**

**封装方案：**
```vue
<template>
  <el-table :data="matrixData" border>
    <el-table-column prop="rowLabel" label="评价维度" width="200" />
    <el-table-column
      v-for="col in columns"
      :key="col.value"
      :label="col.label"
      width="120"
      align="center"
    >
      <template #default="{ row }">
        <el-radio
          v-model="row.value"
          :label="col.value"
          @change="handleChange(row, col)"
        />
      </template>
    </el-table-column>
  </el-table>
</template>
```

**功能增强：**
- 支持自定义行列
- 支持单选每行
- 支持必填验证
- 支持数据统计

**配置项：**
```typescript
interface MatrixSingleSelectConfig {
  rows: Array<{ key: string; label: string }>; // 行数据
  columns: Array<{ value: string; label: string }>; // 列数据
  required: boolean; // 是否必填
  showTotal: boolean; // 显示总分
}
```

---

**2.2.1.2 矩阵多选题组件**

**封装方案：**
```vue
<template>
  <el-table :data="matrixData" border>
    <el-table-column prop="rowLabel" label="评价维度" width="200" />
    <el-table-column
      v-for="col in columns"
      :key="col.value"
      :label="col.label"
      width="120"
      align="center"
    >
      <template #default="{ row }">
        <el-checkbox
          v-model="row.values"
          :label="col.value"
          @change="handleChange(row, col)"
        />
      </template>
    </el-table-column>
  </el-table>
</template>
```

**功能增强：**
- 支持每行多选
- 支持最少/最多选择数量
- 支持数据统计

**配置项：**
```typescript
interface MatrixMultiSelectConfig {
  rows: Array<{ key: string; label: string }>;
  columns: Array<{ value: string; label: string }>;
  minSelect: number; // 最少选择数
  maxSelect: number; // 最多选择数
}
```

---

**2.2.1.3 矩阵量表题组件**

**封装方案：**
```vue
<template>
  <el-table :data="matrixData" border>
    <el-table-column prop="rowLabel" label="评价维度" width="200" />
    <el-table-column
      v-for="col in columns"
      :key="col.value"
      :label="col.label"
      width="120"
      align="center"
    >
      <template #default="{ row }">
        <el-rate
          v-model="row.value"
          :max="maxScore"
          :texts="scaleTexts"
          show-text
        />
      </template>
    </el-table-column>
  </el-table>
</template>
```

**功能增强：**
- 支持李克特量表
- 支持自定义量表范围
- 支持反向计分
- 自动计算平均分

**配置项：**
```typescript
interface MatrixScaleConfig {
  rows: Array<{ key: string; label: string }>;
  columns: Array<{ value: string; label: string }>;
  maxScore: number; // 最大分值
  scaleTexts: string[]; // 量表文本
  reverseScore: boolean; // 反向计分
}
```

---

**2.2.1.4 矩阵填空题组件**

**封装方案：**
```vue
<template>
  <el-table :data="matrixData" border>
    <el-table-column prop="rowLabel" label="项目" width="200" />
    <el-table-column
      v-for="col in columns"
      :key="col.key"
      :label="col.label"
    >
      <template #default="{ row }">
        <el-input
          v-model="row.values[col.key]"
          :type="col.inputType"
          :placeholder="col.placeholder"
        />
      </template>
    </el-table-column>
  </el-table>
</template>
```

**功能增强：**
- 支持多种输入类型
- 支持格式验证
- 支持必填设置

**配置项：**
```typescript
interface MatrixFillConfig {
  rows: Array<{ key: string; label: string }>;
  columns: Array<{
    key: string;
    label: string;
    inputType: 'text' | 'number' | 'textarea';
    placeholder?: string;
  }>;
}
```

---

#### 2.2.2 ElProgress → 进度条题组件

**封装方案：**
```vue
<template>
  <div class="progress-question">
    <el-progress
      :percentage="value"
      :type="type"
      :stroke-width="strokeWidth"
      :text-inside="textInside"
      :status="status"
    />
    <el-slider
      v-model="value"
      :max="100"
      :step="step"
      @input="handleInput"
    />
  </div>
</template>
```

**功能增强：**
- 支持多种进度条样式
- 支持百分比显示
- 支持状态颜色
- 支持滑块调整

**应用场景：**
- 完成度评估
- 满意度百分比
- 进度反馈
- 能力评估

**配置项：**
```typescript
interface ProgressQuestionConfig {
  type: 'line' | 'circle' | 'dashboard'; // 进度条类型
  strokeWidth: number; // 线条宽度
  textInside: boolean; // 文字在内
  status: 'success' | 'exception' | 'warning'; // 状态
  step: number; // 调整步长
}
```

---

#### 2.2.3 ElTimeline → 时间线题组件

**封装方案：**
```vue
<template>
  <el-timeline>
    <el-timeline-item
      v-for="(item, index) in timelineData"
      :key="index"
      :timestamp="item.timestamp"
      :placement="item.placement"
      :type="item.type"
      :color="item.color"
      :size="item.size"
    >
      <el-card>
        <h4>{{ item.title }}</h4>
        <p>{{ item.content }}</p>
      </el-card>
    </el-timeline-item>
  </el-timeline>
</template>
```

**功能增强：**
- 支持时间节点展示
- 支持自定义样式
- 支持交互操作
- 支持动态添加

**应用场景：**
- 项目进度记录
- 学习历程
- 职业发展路径
- 重要事件记录

**配置项：**
```typescript
interface TimelineQuestionConfig {
  items: Array<{
    timestamp: string;
    title: string;
    content: string;
    type?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  }>;
  placement: 'top' | 'bottom'; // 时间戳位置
  editable: boolean; // 可编辑
}
```

---

#### 2.2.4 ElCalendar → 日历选择题组件

**封装方案：**
```vue
<template>
  <el-calendar v-model="selectedDate">
    <template #date-cell="{ data }">
      <div :class="data.isSelected ? 'is-selected' : ''">
        {{ data.day.split('-').slice(2).join('') }}
        <div v-if="hasEvent(data)" class="event-dot"></div>
      </div>
    </template>
  </el-calendar>
</template>
```

**功能增强：**
- 支持日期选择
- 支持事件标记
- 支持范围选择
- 支持自定义样式

**应用场景：**
- 日期选择
- 时间安排
- 事件记录
- 日程规划

**配置项：**
```typescript
interface CalendarQuestionConfig {
  range: boolean; // 范围选择
  markEvents: boolean; // 标记事件
  events: Array<{ date: string; content: string }>; // 事件数据
  firstDayOfWeek: number; // 每周起始日
}
```

---

### 2.3 导航类组件

#### 2.3.1 ElSteps → 分页组件

**封装方案：**
```vue
<template>
  <div class="pagination-question">
    <el-steps :active="currentStep" finish-status="success" align-center>
      <el-step
        v-for="(page, index) in pages"
        :key="index"
        :title="page.title"
        :description="page.description"
      />
    </el-steps>
    <div class="pagination-content">
      <slot :current-page="currentPage" />
    </div>
    <div class="pagination-actions">
      <el-button
        v-if="currentStep > 0"
        @click="prevStep"
      >
        上一页
      </el-button>
      <el-button
        v-if="currentStep < pages.length - 1"
        type="primary"
        @click="nextStep"
      >
        下一页
      </el-button>
      <el-button
        v-if="currentStep === pages.length - 1"
        type="success"
        @click="submit"
      >
        提交
      </el-button>
    </div>
  </div>
</template>
```

**功能增强：**
- 支持分页导航
- 支持步骤条显示
- 支持前进/后退
- 支持进度显示
- 支持每页验证

**应用场景：**
- 长问卷分页
- 分步填写
- 流程表单
- 向导式问卷

**配置项：**
```typescript
interface PaginationQuestionConfig {
  pages: Array<{
    title: string;
    description?: string;
    questions: any[];
  }>;
  showProgress: boolean; // 显示进度
  validateBeforeNext: boolean; // 下一页前验证
  onePageOneQuestion: boolean; // 一页一题
}
```

---

#### 2.3.2 ElPagination → 数据分页组件

**封装方案：**
```vue
<template>
  <el-pagination
    v-model:current-page="currentPage"
    v-model:page-size="pageSize"
    :page-sizes="pageSizes"
    :total="total"
    :layout="layout"
    @size-change="handleSizeChange"
    @current-change="handleCurrentChange"
  />
</template>
```

**功能增强：**
- 支持页码跳转
- 支持每页数量调整
- 支持总数显示
- 支持布局自定义

**应用场景：**
- 选项列表分页
- 数据展示分页
- 题目列表分页

**配置项：**
```typescript
interface PaginationConfig {
  total: number; // 总数
  pageSize: number; // 每页数量
  pageSizes: number[]; // 每页数量选项
  layout: string; // 布局
  showTotal: boolean; // 显示总数
}
```

---

### 2.4 反馈类组件

#### 2.4.1 ElDrawer → 侧边栏题组件

**封装方案：**
```vue
<template>
  <el-drawer
    v-model="visible"
    :title="title"
    :direction="direction"
    :size="size"
  >
    <slot />
  </el-drawer>
</template>
```

**功能增强：**
- 支持侧边栏展开
- 支持自定义内容
- 支持方向配置
- 支持大小调整

**应用场景：**
- 详细信息展开
- 补充信息填写
- 帮助说明
- 选项详情

**配置项：**
```typescript
interface DrawerQuestionConfig {
  title: string; // 标题
  direction: 'rtl' | 'ltr' | 'ttb' | 'btt'; // 方向
  size: string | number; // 大小
  trigger: 'click' | 'hover'; // 触发方式
}
```

---

#### 2.4.2 ElPopover → 气泡卡片题组件

**封装方案：**
```vue
<template>
  <el-popover
    :placement="placement"
    :title="title"
    :width="width"
    trigger="click"
  >
    <template #reference>
      <el-button>{{ triggerText }}</el-button>
    </template>
    <slot />
  </el-popover>
</template>
```

**功能增强：**
- 支持气泡卡片展示
- 支持自定义触发方式
- 支持位置配置
- 支持内容自定义

**应用场景：**
- 选项说明
- 帮助提示
- 补充信息
- 详情展示

**配置项：**
```typescript
interface PopoverQuestionConfig {
  title: string; // 标题
  placement: string; // 位置
  width: number | string; // 宽度
  trigger: 'click' | 'focus' | 'hover' | 'manual'; // 触发方式
  triggerText: string; // 触发文本
}
```

---

#### 2.4.3 ElTooltip → 提示题组件

**封装方案：**
```vue
<template>
  <el-tooltip
    :content="content"
    :placement="placement"
    :effect="effect"
  >
    <slot />
  </el-tooltip>
</template>
```

**功能增强：**
- 支持提示信息展示
- 支持位置配置
- 支持效果配置
- 支持富文本内容

**应用场景：**
- 题目说明
- 选项解释
- 帮助提示
- 补充说明

**配置项：**
```typescript
interface TooltipQuestionConfig {
  content: string; // 提示内容
  placement: string; // 位置
  effect: 'dark' | 'light'; // 效果
  disabled: boolean; // 禁用
}
```

---

### 2.5 其他高级组件

#### 2.5.1 ElColorPicker → 颜色选择题组件

**封装方案：**
```vue
<template>
  <el-color-picker
    v-model="color"
    :show-alpha="showAlpha"
    :color-format="colorFormat"
    :predefine="predefineColors"
  />
</template>
```

**功能增强：**
- 支持颜色选择
- 支持透明度
- 支持颜色格式
- 支持预设颜色

**应用场景：**
- 品牌颜色选择
- 主题颜色选择
- 偏好颜色调查
- 设计调研

**配置项：**
```typescript
interface ColorPickerQuestionConfig {
  showAlpha: boolean; // 显示透明度
  colorFormat: 'hex' | 'rgb' | 'hsl'; // 颜色格式
  predefineColors: string[]; // 预设颜色
  defaultValue: string; // 默认值
}
```

---

#### 2.5.2 ElAutocomplete → 自动补全题组件

**封装方案：**
```vue
<template>
  <el-autocomplete
    v-model="value"
    :fetch-suggestions="querySearch"
    :placeholder="placeholder"
    :trigger-on-focus="false"
    @select="handleSelect"
  />
</template>
```

**功能增强：**
- 支持自动补全
- 支持自定义数据源
- 支持搜索过滤
- 支持选中回调

**应用场景：**
- 地址自动补全
- 姓名自动补全
- 产品名称补全
- 关键词补全

**配置项：**
```typescript
interface AutocompleteQuestionConfig {
  dataSource: any[]; // 数据源
  placeholder: string; // 占位符
  triggerOnFocus: boolean; // 聚焦时触发
  debounce: number; // 防抖延迟
  highlightFirstItem: boolean; // 高亮第一项
}
```

---

#### 2.5.3 ElMention → 提及题组件

**封装方案：**
```vue
<template>
  <el-mention
    v-model="value"
    :options="options"
    :prefix="prefix"
    :placement="placement"
  />
</template>
```

**功能增强：**
- 支持@提及功能
- 支持自定义选项
- 支持前缀配置
- 支持位置配置

**应用场景：**
- 人员提及
- 标签提及
- 关键词提及
- 协作填写

**配置项：**
```typescript
interface MentionQuestionConfig {
  options: Array<{ value: string; label: string; avatar?: string }>; // 选项
  prefix: string; // 前缀（如@）
  placement: string; // 位置
  split: string; // 分隔符
}
```

---

#### 2.5.4 ElInputOTP → 验证码题组件

**封装方案：**
```vue
<template>
  <el-input-otp
    v-model="value"
    :length="length"
    :type="type"
    :max-length="maxLength"
  />
</template>
```

**功能增强：**
- 支持验证码输入
- 支持自定义长度
- 支持自动聚焦
- 支持输入验证

**应用场景：**
- 手机验证码
- 邮箱验证码
- 身份验证
- 安全验证

**配置项：**
```typescript
interface InputOTPQuestionConfig {
  length: number; // 验证码长度
  type: 'text' | 'number'; // 输入类型
  maxLength: number; // 最大长度
  autoFocus: boolean; // 自动聚焦
}
```

---

#### 2.5.5 ElCarousel → 轮播题组件

**封装方案：**
```vue
<template>
  <el-carousel
    :interval="interval"
    :arrow="arrow"
    :indicator-position="indicatorPosition"
    :autoplay="autoplay"
  >
    <el-carousel-item v-for="(item, index) in items" :key="index">
      <img :src="item.image" :alt="item.title" />
      <h3>{{ item.title }}</h3>
    </el-carousel-item>
  </el-carousel>
</template>
```

**功能增强：**
- 支持图片轮播
- 支持自动播放
- 支持指示器配置
- 支持箭头配置

**应用场景：**
- 图片选择
- 产品展示
- 广告展示
- 图片调研

**配置项：**
```typescript
interface CarouselQuestionConfig {
  items: Array<{ image: string; title: string; description?: string }>; // 轮播项
  interval: number; // 轮播间隔
  autoplay: boolean; // 自动播放
  arrow: 'always' | 'hover' | 'never'; // 箭头显示
  indicatorPosition: string; // 指示器位置
}
```

---

#### 2.5.6 ElCollapse → 折叠面板题组件

**封装方案：**
```vue
<template>
  <el-collapse v-model="activeNames" accordion>
    <el-collapse-item
      v-for="item in items"
      :key="item.name"
      :title="item.title"
      :name="item.name"
    >
      <div v-html="item.content"></div>
    </el-collapse-item>
  </el-collapse>
</template>
```

**功能增强：**
- 支持折叠展开
- 支持手风琴模式
- 支持自定义内容
- 支持动画效果

**应用场景：**
- 常见问题FAQ
- 详细说明展开
- 补充信息展示
- 帮助文档

**配置项：**
```typescript
interface CollapseQuestionConfig {
  items: Array<{
    name: string;
    title: string;
    content: string;
  }>;
  accordion: boolean; // 手风琴模式
  defaultActive: string[]; // 默认展开
}
```

---

#### 2.5.7 ElDescriptions → 描述列表题组件

**封装方案：**
```vue
<template>
  <el-descriptions :title="title" :column="column" border>
    <el-descriptions-item
      v-for="item in items"
      :key="item.label"
      :label="item.label"
      :span="item.span"
    >
      {{ item.value }}
    </el-descriptions-item>
  </el-descriptions>
</template>
```

**功能增强：**
- 支持键值对展示
- 支持自定义列数
- 支持边框样式
- 支持跨列配置

**应用场景：**
- 信息确认展示
- 数据汇总展示
- 详情信息展示
- 表单数据预览

**配置项：**
```typescript
interface DescriptionsQuestionConfig {
  title: string; // 标题
  column: number; // 列数
  border: boolean; // 边框
  items: Array<{
    label: string;
    value: string;
    span?: number;
  }>;
}
```

---

#### 2.5.8 ElStatistic → 统计数字题组件

**封装方案：**
```vue
<template>
  <el-statistic
    :title="title"
    :value="value"
    :precision="precision"
    :prefix="prefix"
    :suffix="suffix"
    :value-style="valueStyle"
  />
</template>
```

**功能增强：**
- 支持数字统计展示
- 支持精度配置
- 支持前后缀
- 支持样式自定义
- 支持动态计数动画

**应用场景：**
- 数据统计展示
- 评分结果展示
- 进度统计
- 汇总数据展示

**配置项：**
```typescript
interface StatisticQuestionConfig {
  title: string; // 标题
  value: number; // 数值
  precision: number; // 精度
  prefix: string; // 前缀
  suffix: string; // 后缀
  valueStyle: object; // 数值样式
}
```

---

## 3. 封装优先级建议

| 优先级 | Element Plus 组件 | 封装目标组件 | 推荐理由 |
|-------|-----------------|-------------|---------|
| **P0** | ElCascader | 多级联动题 | 地址选择等高频需求 |
| **P0** | ElUpload | 文件上传题 | 活动报名必备功能 |
| **P0** | ElSlider | 滑块题 | 价格/数量连续值输入 |
| **P0** | ElTable | 矩阵单选题 | 企业满意度调查核心需求 |
| **P1** | ElRate | NPS评分题 | 客户满意度标准题型 |
| **P1** | ElTransfer | 排序题 | 优先级排序常见需求 |
| **P1** | ElSteps | 分页组件 | 长问卷体验优化 |
| **P1** | ElTreeSelect | 树形选择题 | 组织架构等层级选择 |
| **P2** | ElSwitch | 开关题 | 同意/不同意等二元选择 |
| **P2** | ElInputNumber | 数字输入题 | 年龄/数量等精确输入 |
| **P2** | ElProgress | 进度条题 | 完成度评估 |
| **P2** | ElColorPicker | 颜色选择题 | 品牌调研等场景 |
| **P3** | ElTimeline | 时间线题 | 历程记录 |
| **P3** | ElCalendar | 日历选择题 | 日期选择增强 |
| **P3** | ElCarousel | 轮播题 | 图片选择 |
| **P3** | ElCollapse | 折叠面板题 | FAQ展示 |
| **P3** | ElDescriptions | 描述列表题 | 信息确认 |
| **P3** | ElStatistic | 统计数字题 | 结果展示 |

---

## 4. 通用封装模式

### 4.1 组件结构模板

```vue
<template>
  <div class="survey-question-wrapper">
    <!-- 题目标题 -->
    <div class="question-title">
      <span class="required-mark" v-if="config.required">*</span>
      {{ config.title }}
    </div>

    <!-- 题目描述 -->
    <div v-if="config.description" class="question-description">
      {{ config.description }}
    </div>

    <!-- Element Plus 组件封装 -->
    <div class="question-content">
      <el-component
        v-model="internalValue"
        v-bind="componentProps"
        @change="handleChange"
      />
    </div>

    <!-- 错误提示 -->
    <div v-if="errorMessage" class="error-message">
      {{ errorMessage }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface Props {
  modelValue: any
  config: any
}

const props = defineProps<Props>()
const emit = defineEmits(['update:modelValue', 'change'])

const internalValue = ref(props.modelValue)
const errorMessage = ref('')

const componentProps = computed(() => {
  // 根据配置生成组件属性
  return {
    // ...组件特定属性
  }
})

const handleChange = (value: any) => {
  internalValue.value = value
  emit('update:modelValue', value)
  emit('change', value)
}

// 监听外部值变化
watch(() => props.modelValue, (newVal) => {
  internalValue.value = newVal
})
</script>

<style scoped lang="scss">
.survey-question-wrapper {
  margin-bottom: 24px;

  .question-title {
    font-size: 16px;
    font-weight: 500;
    margin-bottom: 8px;

    .required-mark {
      color: #f56c6c;
      margin-right: 4px;
    }
  }

  .question-description {
    font-size: 14px;
    color: #606266;
    margin-bottom: 12px;
  }

  .error-message {
    color: #f56c6c;
    font-size: 12px;
    margin-top: 4px;
  }
}
</style>
```

### 4.2 配置接口定义

```typescript
// 通用题目配置接口
interface BaseQuestionConfig {
  id: string
  type: string
  title: string
  description?: string
  required: boolean
  placeholder?: string
  defaultValue?: any
  validation?: ValidationRule[]
}

// 验证规则接口
interface ValidationRule {
  type: 'required' | 'pattern' | 'min' | 'max' | 'custom'
  message: string
  value?: any
  validator?: (value: any) => boolean
}

// 组件特定配置接口
interface ComponentSpecificConfig {
  // 各组件的特定配置项
}
```

---

## 5. 实现建议

### 5.1 目录结构

```
src/components/SurveyComs/Materials/
├── AdvancedComs/          # 高级组件
│   ├── Cascading.vue      # 多级联动
│   ├── Slider.vue         # 滑块
│   ├── FileUpload.vue     # 文件上传
│   ├── NPS.vue           # NPS评分
│   ├── Ranking.vue       # 排序
│   └── ...
├── MatrixComs/           # 矩阵组件
│   ├── MatrixSingle.vue  # 矩阵单选
│   ├── MatrixMulti.vue   # 矩阵多选
│   ├── MatrixScale.vue   # 矩阵量表
│   ├── MatrixFill.vue    # 矩阵填空
│   └── ...
├── NavigationComs/       # 导航组件
│   ├── Pagination.vue    # 分页
│   └── ...
└── OtherComs/           # 其他组件
    ├── Switch.vue       # 开关
    ├── ColorPicker.vue  # 颜色选择
    └── ...
```

### 5.2 注册流程

```typescript
// 1. 在 componentMap.ts 中注册组件
import Cascading from '@/components/SurveyComs/Materials/AdvancedComs/Cascading.vue'

export const componentMap = {
  'cascading': markRaw(Cascading),
  // ...其他组件
}

// 2. 在 defaultStatusMap.ts 中添加默认配置
export const defaultStatusMap = {
  'cascading': () => ({
    type: 'cascading',
    title: '请选择',
    required: false,
    config: {
      dataSource: 'address',
      levels: 3,
      separator: '/',
    }
  }),
  // ...其他配置
}

// 3. 在 SurveyGroupConfig.ts 中添加到组件列表
export const SurveyComsList = [
  {
    title: '高级题型',
    icon: Files,
    list: [
      { materialName: 'cascading', comName: '多级联动' },
      { materialName: 'slider', comName: '滑块' },
      { materialName: 'file-upload', comName: '文件上传' },
      // ...其他组件
    ]
  }
]
```

---

## 6. 总结

Element Plus 提供了丰富的组件库，可以很好地支持问卷编辑器的高级组件封装。通过合理的封装设计，可以快速扩展项目功能，满足更多问卷场景需求。

**核心优势：**
- 组件成熟稳定，开箱即用
- 样式统一，用户体验一致
- TypeScript 支持，类型安全
- 文档完善，易于上手

**实施建议：**
1. 优先实现高频需求组件（P0/P1）
2. 遵循统一封装模式，保持代码一致性
3. 完善配置接口，提高灵活性
4. 注重组件复用，减少重复代码

---

**文档版本：** v1.0  
**生成日期：** 2026年6月  
**分析范围：** Element Plus 完整组件库