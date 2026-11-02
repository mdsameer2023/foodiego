import { test, expect, type Page } from '@playwright/test';

const user=(role:'CUSTOMER'|'DELIVERY_PARTNER')=>({id:'partner-test',name:'FoodieGo Tester',email:'tester@example.com',phone:null,avatar:null,role,isEmailVerified:true});
const emptyCart={restaurant:null,items:[],pricing:{subtotalPaise:0,customizationPaise:0,deliveryFeePaise:0,packagingFeePaise:0,taxPaise:0,discountPaise:0,totalPaise:0}};
async function mockBasics(page:Page,role:'CUSTOMER'|'DELIVERY_PARTNER'){
  await page.route('http://localhost:*/api/auth/me',route=>route.fulfill({json:{data:{user:user(role)}}}));
  await page.route('http://localhost:*/api/cart',route=>route.fulfill({json:{data:emptyCart}}));
  await page.route('http://localhost:*/api/auth/csrf',route=>route.fulfill({json:{data:{csrfToken:'test-csrf'}}}));
}

test('verified, failed and pending payment pages remain usable on mobile and desktop',async({page})=>{
  await mockBasics(page,'CUSTOMER');
  await page.route('http://localhost:*/api/payments/*/status',route=>{
    const id=new URL(route.request().url()).pathname.split('/')[3];
    const checkoutState=id==='success'?'CONFIRMED':id==='failed'?'FAILED':'PENDING_PAYMENT';
    return route.fulfill({json:{data:{orderId:id,orderNumber:'FG-TEST-123',restaurantName:'Test Kitchen',amountPaise:28000,paymentStatus:checkoutState==='CONFIRMED'?'PAID':checkoutState==='FAILED'?'FAILED':'PENDING',checkoutState,attemptStatus:null,failureReason:checkoutState==='FAILED'?'Test payment declined':null}}});
  });
  for(const width of [320,375,430,768,1024,1440,1920]){
    await page.setViewportSize({width,height:900});
    for(const [path,heading] of [['/payment/success?orderId=success','Payment confirmed'],['/payment/failed?orderId=failed','Payment failed'],['/payment/pending?orderId=pending','Payment is processing']]){
      await page.goto(path);
      await expect(page.getByRole('heading',{name:heading})).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${path} overflows at ${width}px`).toBe(true);
    }
  }
});

test('partner can accept an assignment from responsive delivery controls',async({page})=>{
  await mockBasics(page,'DELIVERY_PARTNER');
  let status='OFFERED';
  const row=()=>({id:'delivery-test',orderId:'order-test',restaurantId:'restaurant-test',assignmentStatus:status,trackingEnabled:false,assignedAt:new Date().toISOString()});
  await page.route('http://localhost:*/api/deliveries/mine',route=>route.fulfill({json:{data:[row()]}}));
  await page.route('http://localhost:*/api/deliveries/delivery-test/accept',route=>{status='ACCEPTED';return route.fulfill({json:{data:row()}});});
  await page.setViewportSize({width:320,height:900});
  await page.goto('/deliveries');
  await expect(page.getByRole('heading',{name:'Assigned deliveries'})).toBeVisible();
  await page.getByRole('button',{name:'Accept'}).click();
  await expect(page.getByRole('button',{name:'Mark picked up'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('customer tracking shows real status timeline when map credentials are absent',async({page})=>{
  await mockBasics(page,'CUSTOMER');
  const order={id:'order-test',orderNumber:'FG-TEST-123',restaurantId:'restaurant-test',restaurantSnapshot:{name:'Test Kitchen',image:'',averageDeliveryTime:30},items:[{menuItemId:'item-test',name:'Biryani',quantity:1,totalPaise:28000,selections:[]}],deliveryAddressSnapshot:{fullName:'FoodieGo Tester',phone:'9999999999',addressLine1:'12 Park Street',city:'Kolkata',state:'West Bengal',postalCode:'700016'},deliveryInstructions:'',pricingBreakdown:{subtotalPaise:28000,customizationPaise:0,deliveryFeePaise:0,packagingFeePaise:0,taxPaise:0,discountPaise:0,totalPaise:28000},paymentMethod:'COD',paymentStatus:'PENDING',orderStatus:'ON_THE_WAY',statusHistory:[{status:'PLACED',at:new Date().toISOString()},{status:'ON_THE_WAY',at:new Date().toISOString()}],placedAt:new Date().toISOString()};
  await page.route('http://localhost:*/api/orders/order-test',route=>route.fulfill({json:{data:order}}));
  await page.route('http://localhost:*/api/deliveries/order/order-test',route=>route.fulfill({json:{data:{id:'delivery-test',orderId:'order-test',restaurantId:'restaurant-test',assignmentStatus:'ON_THE_WAY',trackingEnabled:false,assignedAt:new Date().toISOString(),partner:{name:'Partner Tester',phone:null},location:null}}}));
  for(const width of [320,375,430,768,1024,1440,1920]){
    await page.setViewportSize({width,height:900});
    await page.goto('/orders/order-test/track');
    await expect(page.getByRole('heading',{name:'Test Kitchen'})).toBeVisible();
    await expect(page.getByText('Live map is unavailable. Follow the order status below.')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`tracking overflows at ${width}px`).toBe(true);
  }
});

test('online checkout opens Razorpay and waits for backend verification before success',async({page})=>{
  await mockBasics(page,'CUSTOMER');
  const pricing={subtotalPaise:28000,customizationPaise:0,deliveryFeePaise:0,packagingFeePaise:0,taxPaise:0,discountPaise:0,totalPaise:28000};
  const cart={restaurant:{id:'restaurant-test',name:'Test Kitchen',image:'',averageDeliveryTime:30,isOpen:true,codEnabled:true},items:[{key:'line-test',menuItemId:'item-test',name:'Biryani',image:'/images/biryani.jpg',quantity:1,unitPricePaise:28000,selections:[],customizationPaise:0,totalPaise:28000,specialInstructions:''}],pricing};
  const address={id:'address-test',fullName:'FoodieGo Tester',phone:'9999999999',addressLine1:'12 Park Street',addressLine2:'',landmark:'',city:'Kolkata',state:'West Bengal',postalCode:'700016',addressType:'HOME',isDefault:true};
  let verified=false;
  await page.route('http://localhost:*/api/cart',route=>route.fulfill({json:{data:cart}}));
  await page.route('http://localhost:*/api/users/addresses',route=>route.fulfill({json:{data:[address]}}));
  await page.route('http://localhost:*/api/coupons/available',route=>route.fulfill({json:{data:[]}}));
  await page.route('http://localhost:*/api/checkout/quote',route=>route.fulfill({json:{data:cart}}));
  await page.route('http://localhost:*/api/payments/create-order',route=>route.fulfill({status:201,json:{data:{orderId:'order-test',razorpayOrderId:'order_provider_test',amountPaise:28000,currency:'INR',keyId:'rzp_test_fake'}}}));
  await page.route('http://localhost:*/api/payments/verify',route=>{verified=true;return route.fulfill({json:{data:{orderId:'order-test',paymentStatus:'PAID',checkoutState:'CONFIRMED'}}});});
  await page.route('http://localhost:*/api/payments/order-test/status',route=>route.fulfill({json:{data:{orderId:'order-test',orderNumber:'FG-TEST-123',restaurantName:'Test Kitchen',amountPaise:28000,paymentStatus:'PAID',checkoutState:'CONFIRMED',attemptStatus:'CAPTURED',failureReason:null}}}));
  await page.route('https://checkout.razorpay.com/v1/checkout.js',route=>route.fulfill({contentType:'application/javascript',body:`window.Razorpay=class{constructor(options){this.options=options}open(){localStorage.setItem('phase5-razorpay-opened','1');this.options.handler({razorpay_payment_id:'pay_test',razorpay_order_id:this.options.order_id,razorpay_signature:'test_signature'})}on(){}};`}));
  await page.goto('/checkout');
  await expect(page.getByRole('heading',{name:'The final little details.'})).toBeVisible();
  await page.getByText('Online payment · UPI, cards and more').click();
  await page.getByRole('button',{name:'Pay securely'}).click();
  await expect(page.getByRole('heading',{name:'Payment confirmed'})).toBeVisible();
  expect(verified).toBe(true);
  expect(await page.evaluate(()=>localStorage.getItem('phase5-razorpay-opened'))).toBe('1');
});

test('partner location sharing needs permission and stops on request',async({page})=>{
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({latitude:22.57,longitude:88.36});
  await mockBasics(page,'DELIVERY_PARTNER');
  const row={id:'delivery-test',orderId:'order-test',restaurantId:'restaurant-test',assignmentStatus:'ACCEPTED',trackingEnabled:false,assignedAt:new Date().toISOString()};
  let locationPosts=0,stopped=false;
  await page.route('http://localhost:*/api/deliveries/mine',route=>route.fulfill({json:{data:[row]}}));
  await page.route('http://localhost:*/api/deliveries/delivery-test/tracking/start',route=>route.fulfill({json:{data:{trackingEnabled:true}}}));
  await page.route('http://localhost:*/api/deliveries/delivery-test/tracking/stop',route=>{stopped=true;return route.fulfill({json:{data:{trackingEnabled:false}}});});
  await page.route('http://localhost:*/api/deliveries/delivery-test/location',route=>{locationPosts++;return route.fulfill({json:{data:{saved:true,lastUpdatedAt:new Date().toISOString()}}});});
  await page.goto('/deliveries');
  await page.getByRole('button',{name:'Share live location'}).click();
  await expect(page.getByRole('button',{name:'Stop sharing location'})).toBeVisible();
  expect(locationPosts).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Stop sharing location'}).click();
  await expect(page.getByRole('button',{name:'Share live location'})).toBeVisible();
  expect(stopped).toBe(true);
});
