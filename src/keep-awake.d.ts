declare module "react-native-keep-awake" {
  import type { Component } from "react";

  export default class KeepAwake extends Component<{}> {
    static activate(): void;
    static deactivate(): void;
  }
}
