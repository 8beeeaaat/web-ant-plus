export type SendCallback = (result: boolean) => void;
export enum PageState {
  INIT_PAGE = 0,
  STD_PAGE = 1,
  EXT_PAGE = 2,
}

export type Page = {
  oldPage: number;
  pageState: PageState; // sets the state of the receiver - INIT, STD_PAGE, EXT_PAGE
};
