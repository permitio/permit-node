declare module 'require-in-the-middle' {
  function OnRequire(exports: any, name: string, basedir: string): unknown;
  function Hook(
    modules: string[],
    options: any,
    onrequire: typeof OnRequire
  ): any;
  export = Hook;
}
