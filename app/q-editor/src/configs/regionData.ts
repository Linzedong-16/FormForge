// 省/市/区三级联动数据源（精简版，用于多级联动题的地址选择）
// 数据结构与 ElCascader 默认字段一致：{ value, label, children }
// 作为固定资源由业务组件直接引用，不进入组件 status，无需在编辑器中维护

export interface RegionNode {
  value: string;
  label: string;
  children?: RegionNode[];
}

export const regionData: RegionNode[] = [
  {
    value: "beijing",
    label: "北京市",
    children: [
      {
        value: "beijing-city",
        label: "北京市",
        children: [
          { value: "dongcheng", label: "东城区" },
          { value: "xicheng", label: "西城区" },
          { value: "chaoyang", label: "朝阳区" },
          { value: "haidian", label: "海淀区" },
          { value: "fengtai", label: "丰台区" }
        ]
      }
    ]
  },
  {
    value: "shanghai",
    label: "上海市",
    children: [
      {
        value: "shanghai-city",
        label: "上海市",
        children: [
          { value: "huangpu", label: "黄浦区" },
          { value: "xuhui", label: "徐汇区" },
          { value: "changning", label: "长宁区" },
          { value: "jingan", label: "静安区" },
          { value: "pudong", label: "浦东新区" }
        ]
      }
    ]
  },
  {
    value: "guangdong",
    label: "广东省",
    children: [
      {
        value: "guangzhou",
        label: "广州市",
        children: [
          { value: "tianhe", label: "天河区" },
          { value: "yuexiu", label: "越秀区" },
          { value: "haizhu", label: "海珠区" },
          { value: "panyu", label: "番禺区" }
        ]
      },
      {
        value: "shenzhen",
        label: "深圳市",
        children: [
          { value: "futian", label: "福田区" },
          { value: "nanshan", label: "南山区" },
          { value: "luohu", label: "罗湖区" },
          { value: "baoan", label: "宝安区" }
        ]
      }
    ]
  },
  {
    value: "zhejiang",
    label: "浙江省",
    children: [
      {
        value: "hangzhou",
        label: "杭州市",
        children: [
          { value: "xihu", label: "西湖区" },
          { value: "shangcheng", label: "上城区" },
          { value: "binjiang", label: "滨江区" },
          { value: "yuhang", label: "余杭区" }
        ]
      },
      {
        value: "ningbo",
        label: "宁波市",
        children: [
          { value: "haishu", label: "海曙区" },
          { value: "jiangbei", label: "江北区" },
          { value: "yinzhou", label: "鄞州区" }
        ]
      }
    ]
  },
  {
    value: "jiangsu",
    label: "江苏省",
    children: [
      {
        value: "nanjing",
        label: "南京市",
        children: [
          { value: "xuanwu", label: "玄武区" },
          { value: "gulou", label: "鼓楼区" },
          { value: "jianye", label: "建邺区" },
          { value: "qinhuai", label: "秦淮区" }
        ]
      },
      {
        value: "suzhou",
        label: "苏州市",
        children: [
          { value: "gusu", label: "姑苏区" },
          { value: "wuzhong", label: "吴中区" },
          { value: "huqiu", label: "虎丘区" }
        ]
      }
    ]
  }
];
