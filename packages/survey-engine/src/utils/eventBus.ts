import mitt from "mitt";
import type { Events } from "../types/eventBus";

const emitter = mitt<Events>();
export default emitter;
