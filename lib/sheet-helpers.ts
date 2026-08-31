export type CreditCardLike = {
  id: string;
  name: string;
  user_id: string;
  status: "active" | "closed";
};