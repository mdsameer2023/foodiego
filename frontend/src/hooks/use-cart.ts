'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import { useStore } from '@/store/use-store';
import { commerceService, type CartView, type Selection } from '@/services/commerce';
import type { MenuItem } from '@/types';

export function useCart() {
  const {data:user,isPending:authPending}=useAuth();
  const client=useQueryClient();
  const guestItems=useStore(state=>state.items);
  const guestAdd=useStore(state=>state.add);
  const guestQuantity=useStore(state=>state.quantity);
  const guestClear=useStore(state=>state.clear);
  const key=['cart',user?.id];
  const query=useQuery({queryKey:key,queryFn:commerceService.cart,enabled:!!user,staleTime:10_000});
  const invalidate=()=>client.invalidateQueries({queryKey:key});
  const addMutation=useMutation({mutationFn:commerceService.add,onSuccess:data=>client.setQueryData(key,data)});
  const updateMutation=useMutation({mutationFn:({itemKey,quantity}:{itemKey:string;quantity:number})=>commerceService.update(itemKey,{quantity}),onMutate:async({itemKey,quantity})=>{
    await client.cancelQueries({queryKey:key});const previous=client.getQueryData<CartView>(key);
    if(previous)client.setQueryData<CartView>(key,{...previous,items:previous.items.map(item=>item.key===itemKey?{...item,quantity}:item).filter(item=>item.quantity>0)});
    return {previous};
  },onError:(_error,_variables,context)=>client.setQueryData(key,context?.previous),onSuccess:data=>client.setQueryData(key,data),onSettled:invalidate});
  const removeMutation=useMutation({mutationFn:commerceService.remove,onMutate:async itemKey=>{
    await client.cancelQueries({queryKey:key});const previous=client.getQueryData<CartView>(key);
    if(previous)client.setQueryData<CartView>(key,{...previous,items:previous.items.filter(item=>item.key!==itemKey)});
    return {previous};
  },onError:(_error,_variables,context)=>client.setQueryData(key,context?.previous),onSuccess:data=>client.setQueryData(key,data),onSettled:invalidate});
  const clearMutation=useMutation({mutationFn:commerceService.clear,onSuccess:data=>client.setQueryData(key,data)});
  async function add(item:MenuItem,selections:Selection[]) {
    const option=selections.map(group=>group.options.join(', ')).join(' · ') || 'Regular';
    const extra=selections.reduce((total,group)=>total+group.options.reduce((sum,name)=>sum+(item.customizationOptions?.find(entry=>entry.name===group.group)?.options.find(entry=>entry.name===name)?.price||0),0),0);
    if(user){await addMutation.mutateAsync({menuItemId:item.id,quantity:1,selections});return true;}
    return guestAdd(item,option,extra,selections);
  }
  async function quantity(itemKey:string,next:number) {
    if(user) {if(next<=0)await removeMutation.mutateAsync(itemKey);else await updateMutation.mutateAsync({itemKey,quantity:next});}
    else {const current=guestItems.find(item=>item.key===itemKey);if(current)guestQuantity(itemKey,next-current.quantity);}
  }
  async function clear() {if(user)await clearMutation.mutateAsync();else guestClear();}
  const count=user?query.data?.items.reduce((sum,item)=>sum+item.quantity,0)||0:guestItems.reduce((sum,item)=>sum+item.quantity,0);
  return {user,authPending,serverCart:query.data,guestItems,query,count,add,quantity,clear,error:addMutation.error||updateMutation.error||removeMutation.error||clearMutation.error,busy:addMutation.isPending||updateMutation.isPending||removeMutation.isPending||clearMutation.isPending};
}
