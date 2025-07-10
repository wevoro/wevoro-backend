export type IFeedback = {
  _id?: string;
  user?: string;
  message: string;
  feedbackType: 'Feature request' | 'Report a bug to fix' | 'Others';
  selections?: string[];
  isReadByAdmin?: boolean;
  status?: 'New' | 'Pending' | 'Solved';
  createdAt?: Date;
  updatedAt?: Date;
} 