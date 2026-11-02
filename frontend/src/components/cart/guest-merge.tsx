'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useHydrated } from '@/hooks/use-hydrated';
import { useStore } from '@/store/use-store';
import { commerceService, type Selection } from '@/services/commerce';
import { catalogService } from '@/services/catalog';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

export function GuestCartMerge() {
  const {data:user}=useAuth();const hydrated=useHydrated();const client=useQueryClient();
  const guestItems=useStore(state=>state.items);const clear=useStore(state=>state.clear);
  const [dismissed,setDismissed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const open=!!(hydrated && user && guestItems.length && !dismissed);
  if(!user || !hydrated || !guestItems.length)return null;
  async function merge() {
    setBusy(true);setError('');
    try {
      const account=await commerceService.cart();
      const guestRestaurant=await catalogService.get(guestItems[0].restaurantId);
      const conflict=!!account.items.length && account.restaurant?.id!==guestRestaurant.id;
      const unavailable:string[]=[];
      const currentMenu=await catalogService.menu(guestItems[0].restaurantId);
      const validItems:Array<{menuItemId:string;quantity:number;selections:Selection[]}> = [];
      for(const guest of guestItems) {
        try {
          const match=currentMenu.find(item=>item.demoId===guest.id || item.id===guest.id);
          if(!match)throw new Error('No longer available');
          const selections:Selection[]=guest.selections?.length?guest.selections:match.customizationOptions?.length&&guest.option&&guest.option!=='Regular'?[{group:match.customizationOptions[0].name,options:[guest.option]}]:[];
          for(const group of match.customizationOptions||[]){const chosen=selections.find(entry=>entry.group===group.name)?.options||[];if(chosen.length<(group.minSelections||Number(group.required))||chosen.length>(group.maxSelections||group.options.length)||chosen.some(option=>!group.options.some(entry=>entry.name===option)))throw new Error('Customization unavailable');}
          if(selections.some(selection=>!match.customizationOptions?.some(group=>group.name===selection.group)))throw new Error('Customization unavailable');
          validItems.push({menuItemId:match.id,quantity:guest.quantity,selections});
        } catch {unavailable.push(guest.name);}
      }
      if(!validItems.length)throw new Error('No guest items are currently available. Your account cart was not changed.');
      if(conflict) await commerceService.clear();
      let merged=0;
      for(const item of validItems)try{await commerceService.add(item);merged++;}catch{unavailable.push(currentMenu.find(row=>row.id===item.menuItemId)?.name||'An item');}
      if(!merged)throw new Error('No guest items could be merged. Your guest cart is still saved.');
      clear();await client.invalidateQueries({queryKey:['cart',user!.id]});
      if(unavailable.length)setError(`Some items could not be merged: ${unavailable.join(', ')}. Your available items are in your account cart.`);
      else setDismissed(true);
    } catch(cause){setError(cause instanceof Error?cause.message:'Could not merge cart. Your guest cart is still saved.');}
    finally{setBusy(false);}
  }
  return <Modal open={open} onOpenChange={value=>{if(!value)setDismissed(true);}} title="Bring your guest cart along?">
    <p className="mb-4">You have {guestItems.length} item{guestItems.length===1?'':'s'} from before logging in. Merge them into your account cart? If it contains another restaurant, starting a new cart will replace it.</p>
    {error&&<p role="alert" className="notice red mb-3">{error}</p>}
    <div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={merge}>Merge guest cart / Start New Cart</Button><Button disabled={busy} variant="outline" onClick={()=>{clear();setDismissed(true);}}>Keep account cart</Button></div>
  </Modal>;
}
