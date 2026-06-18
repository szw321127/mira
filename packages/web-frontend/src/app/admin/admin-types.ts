export type AdminSession = {
  username: string;
};

export type ManagedSecret = {
  key: string;
  label: string;
  value: string;
  masked: boolean;
};
