import DataLoader from 'dataloader';
import { User, Group } from './connectors';

const batchGetUsers = keys => User.findAll({ where: { id: { $in: keys } } });
const batchGetGroups = keys => Group.findAll({ where: { id: { $in: keys } } });

export const userLoader = () => new DataLoader(keys => batchGetUsers(keys));
export const groupLoader = () => new DataLoader(keys => batchGetGroups(keys));
