/**
 * better-sqlite3 类型适配
 */
import DatabaseConstructor from "better-sqlite3";

/** Database 实例类型 — 用于参数和变量声明 */
export type Database = InstanceType<typeof DatabaseConstructor>;

/** Database 构造函数 — 用于 new Database() 和继承方法 */
export default DatabaseConstructor;
