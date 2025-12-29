function onSort (type , product){
    if(type == 'price_low_high'){
        return  product.sort(function(a,b){
            return a.priceNew - b.priceNew
        })
    }
    else if(type == 'price_high_low'){
        return product.sort(function(a,b){
            return b.priceNew - a.priceNew
        })
    }
    else if(type == 'name_(a-z)'){
        return product.sort(function(a,b){
            return a.name.localeCompare(b.name, 'he'); 
        })  
    }
    else if(type == 'name_(z-a)'){
        return product.sort(function(a,b){
            return b.name.localeCompare(a.name, 'he')
        })  
    }
    return product;//אם לא בחרתי כלום
}
function createNewProducts (product, container, cartData) {
    const itemDiv = document.createElement("div");
            itemDiv.classList.add("item");


            const imgLink = document.createElement("a");
            imgLink.href = `product page.html?id=${product.id}`;

            const img = document.createElement("img");
            img.src = product.image;
            img.classList.add("image");
            imgLink.appendChild(img);
            itemDiv.appendChild(imgLink);


            const titleLink = document.createElement("a");
            titleLink.href = `product page.html?id=${product.id}`;

            const labelDiv = document.createElement("div");
            labelDiv.classList.add("lable");

            const title = document.createElement("h2");
            title.classList.add("title");
            title.textContent = product.name;

            const remark = document.createElement("div");
            remark.classList.add("remark");
            remark.textContent = product.id;

            titleLink.appendChild(labelDiv);
            titleLink.appendChild(title);
            titleLink.appendChild(remark);
            itemDiv.appendChild(titleLink);


            const priceLink = document.createElement("a");
            priceLink.href = `product page.html?id=${product.id}`;

            const priceDiv = document.createElement("div");
            priceDiv.classList.add("price");

            if (product.priceOld) {       /*אם יש מחיר נציג אותו*/
                const oldPrice = document.createElement("span");
                oldPrice.classList.add("old");
                oldPrice.textContent = "₪" + product.priceOld;
                priceDiv.appendChild(oldPrice);
            }

            const newPrice = document.createElement("span");
            newPrice.classList.add("new");
            newPrice.textContent = "₪" + product.priceNew;
            priceDiv.appendChild(newPrice);

            priceLink.appendChild(priceDiv);
            itemDiv.appendChild(priceLink);


            const brandDiv = document.createElement("div");
            brandDiv.classList.add("brands");

            const brandImg = document.createElement("img");
            brandImg.src = product.brand;
            brandDiv.appendChild(brandImg)
            itemDiv.appendChild(brandDiv);


            const cartDiv = document.createElement("div");
            cartDiv.classList.add("add-to-cart");

            const cartLink = document.createElement("a");
            cartLink.href = "#";

            const cartBtn = document.createElement("button");
            cartBtn.classList.add("cart");
            cartBtn.innerHTML = '<i class="fa fa-shopping-cart"></i>';
            cartLink.appendChild(cartBtn);

            const isInCart = cartData.some(p => p.id === product.id); // בודק אם המוצר כבר בעגלה
            if (isInCart) {
                cartBtn.classList.add("active"); // אם המוצר בעגלה, הוסף קלאס אקטיב
            }


            //עגלה
            cartLink.addEventListener("click", (event) => {

                event.preventDefault(); // למנוע מעבר לקישור

                let cart = JSON.parse(localStorage.getItem("cart") || "[]");//לוקח את העגלה מה- localStorage

                const index = cart.findIndex(p => p.id === product.id);// מחפש אם המוצר כבר בעגלה לפי בחירת ה-id

                if (index !== -1) {
                    cart[index].count += 1; // עדכון כמות
                }
                else {
                    const newProduct = { ...product, count: 1 };//אם מוצר לא קיים בעגלה אז נוסיף אותו עם כמות של 1
                    cart.push(newProduct); // הוספה
                }

                localStorage.setItem("cart", JSON.stringify(cart));//שומר את  העגלה ב- localStorage

                cartBtn.classList.add("active"); //הוספת קלאס לשינוי צבע 
                shopBadge.textContent = cart.length; //עדכון מספר הפריטים בעגלה
                faShopping.classList.add("active"); //הוספת קלאס לעגלת קניות

            });



            const fastBuyLink = document.createElement("a");
            fastBuyLink.href = "#";

            const fastBuyBtn = document.createElement("button");
            fastBuyBtn.classList.add("fest-buy");
            fastBuyBtn.innerHTML = "קנייה מהירה";
            fastBuyLink.appendChild(fastBuyBtn);

            cartDiv.appendChild(cartLink);
            cartDiv.appendChild(fastBuyLink);
            itemDiv.appendChild(cartDiv);


            container.appendChild(itemDiv);
            container.style.width = '100%';
}

//מקורי
/*document.addEventListener( "DOMContentLoaded" , () =>{
    const checkbox = document.querySelectorAll('#myCheck'); 
    const sortRow = document.querySelector('.sort-row');
    const container = document.querySelector('.items');
    let filterArr = [];
    let sortArr = [];

    fetch('products.json')
        .then(response => response.json())
        .then(data => {
            filterArr = data; 

            document.querySelector('.sort-model')?.addEventListener('change',function(event){
                let type = event.target.value;  
                if(sortArr.length>0){
                    const sortedProducts = onSort(type, [...sortArr]);
                    renderProducts(sortedProducts , container);    
                }else{
                    const sortedProducts = onSort(type, [...filterArr]);
                    renderProducts(sortedProducts , container);      
                }    
            })
            
            renderProducts(filterArr , container);
        })
        .catch(error => {  return console.error("שגיאה בטעינת המוצרים:", error); })

    function renderProducts(products , container){
        container.innerHTML = '';


        const cartData = JSON.parse(localStorage.getItem("cart") || "[]");

        products.forEach(product => {
            createNewProducts(product, container, cartData);
        });

    }
    //הסינון
    checkbox.forEach(check =>{
        check.addEventListener('change' , () =>{

            const selectSort = Array.from(checkbox)
            .filter(checkbox => checkbox.checked)
            .map(checkbox => checkbox.value);

            if(selectSort.length > 0){
                const filtered = filterArr.filter(product => 
                    selectSort.includes(product.attributes.Hz )         //קצב רענון
                ||  selectSort.includes(product.company)                //חברה
                ||  selectSort.includes(product.attributes.storage)     //אחסון
                ||  selectSort.includes(product.attributes.ram)         //זכרון
                ||  selectSort.includes(product.attributes.rezolution)  //רזולוצייה
                );
                sortArr=filtered;
                renderProducts(sortArr , container);
            } 
            else{
                renderProducts(filterArr , container);
            }
        });
    });
});*/

//AI
document.addEventListener("DOMContentLoaded", () => {
    const checkboxList = document.querySelectorAll('input[type="checkbox"]');
    const selectSort = document.querySelector('.sort-model select');
    const clearBtn = document.querySelector('.clear-filters');
    const container = document.querySelector('.items');

    let allProducts = [];

    // --- טעינת המוצרים ---
    fetch('products.json')
        .then(res => res.json())
        .then(data => {
            allProducts = data;

            // הגדר מצב ראשוני לפי URL
            const params = new URLSearchParams(window.location.search);
            const selectedFilters = params.get('filters') ? params.get('filters').split(',') : [];
            const sortType = params.get('sort') || '';

            checkboxList.forEach(ch => {
                if (selectedFilters.includes(ch.value)) ch.checked = true;
            });

            if (sortType) selectSort.value = sortType;

            applyFilterAndSort();

            // --- מאזיני אירועים ---
            selectSort.addEventListener('change', () => {
                updateURL();
                applyFilterAndSort();
            });

            checkboxList.forEach(ch => {
                ch.addEventListener('change', () => {
                    updateURL();
                    applyFilterAndSort();
                });
            });

            clearBtn.addEventListener('click', () => {
                checkboxList.forEach(ch => ch.checked = false);
                selectSort.value = 'news'; // או ברירת מחדל
                updateURL(true);
                applyFilterAndSort();
            });
        })
        .catch(err => console.error("שגיאה בטעינת המוצרים:", err));

    // --- פונקציה לסינון ומיון ---
    function applyFilterAndSort() {
        const checkedValues = Array.from(checkboxList)
            .filter(c => c.checked)
            .map(c => c.value);

        let filtered = allProducts;

        if (checkedValues.length > 0) {
            filtered = allProducts.filter(product =>
                checkedValues.includes(product.attributes.Hz) ||
                checkedValues.includes(product.company) ||
                checkedValues.includes(product.attributes.storage) ||
                checkedValues.includes(product.attributes.ram) ||
                checkedValues.includes(product.attributes.rezolution)
            );
        }

        let sorted = filtered;
        if (selectSort.value) {
            sorted = onSort(selectSort.value, [...filtered]);
        }


        renderProducts(sorted);
    }

    // --- עדכון URL ---
    function updateURL(clear = false) {
        const params = new URLSearchParams();

        if (!clear) {
            const checkedValues = Array.from(checkboxList)
                .filter(c => c.checked)
                .map(c => c.value);

            if (checkedValues.length > 0) params.set('filters', checkedValues.join(','));
            if (selectSort.value) {
                params.set('sort', selectSort.value);
            }

        }

        const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
        window.history.replaceState({}, '', newUrl);
    }

    // --- רינדור מוצרים ---
    function renderProducts(products) {
        container.innerHTML = '';
        const cartData = JSON.parse(localStorage.getItem("cart") || "[]");
        products.forEach(product => {
            createNewProducts(product, container, cartData);
        });
    }
});

//לא מוצלח
/*document.addEventListener("DOMContentLoaded", () => {
    const checkbox = document.querySelectorAll('#myCheck'); 
    const sortRow = document.querySelector('.sort-row');
    const container = document.querySelector('.items');
    const clearBtn = document.querySelector('.clear-filters'); // כפתור נקה
    let filterArr = [];
    let sortArr = [];

    // --- טעינת המוצרים ---
    fetch('products.json')
        .then(response => response.json())
        .then(data => {
            filterArr = data; 

            // --- מיון ---
            document.querySelector('.sort-model')?.addEventListener('change', function(event){
                let type = event.target.value;  
                if(sortArr.length > 0){
                    const sortedProducts = onSort(type, [...sortArr]);
                    renderProducts(sortedProducts , container);    
                } else {
                    const sortedProducts = onSort(type, [...filterArr]);
                    renderProducts(sortedProducts , container);      
                }    

                updateURL(); // <-- הוספנו שמירה ב-URL
            });

            // --- סימון צ'קבוקסים מה-URL ---
            const params = new URLSearchParams(window.location.search);
            const selectedFilters = params.get('filters') ? params.get('filters').split(',') : [];
            const sortType = params.get('sort') || '';
            checkbox.forEach(ch => {
                if (selectedFilters.includes(ch.value)) ch.checked = true;
            });
            if (sortType) document.querySelector('.sort-model').value = sortType;

            renderProducts(filterArr , container);
        })
        .catch(error => console.error("שגיאה בטעינת המוצרים:", error));

    // --- פונקציה לרינדור ---
    function renderProducts(products , container){
        container.innerHTML = '';
        const cartData = JSON.parse(localStorage.getItem("cart") || "[]");
        products.forEach(product => {
            createNewProducts(product, container, cartData);
        });
    }

    // --- סינון ---
    checkbox.forEach(check => {
        check.addEventListener('change', () => {
            const selectSortValues = Array.from(checkbox)
                .filter(c => c.checked)
                .map(c => c.value);

            if(selectSortValues.length > 0){
                const filtered = filterArr.filter(product => 
                    selectSortValues.includes(product.attributes.Hz ) ||
                    selectSortValues.includes(product.company) ||
                    selectSortValues.includes(product.attributes.storage) ||
                    selectSortValues.includes(product.attributes.ram) ||
                    selectSortValues.includes(product.attributes.rezolution)
                );
                sortArr = filtered;
                renderProducts(sortArr , container);
            } else {
                renderProducts(filterArr , container);
            }

            updateURL(); // <-- הוספנו שמירה ב-URL
        });
    });

    // --- כפתור נקה סינון ---
    clearBtn?.addEventListener('click', () => {
        checkbox.forEach(ch => ch.checked = false);
        sortArr = [];
        document.querySelector('.sort-model').value = 'news'; // ברירת מחדל
        renderProducts(filterArr , container);
        updateURL(true);
    });

    // --- פונקציה לעדכון URL ---
    function updateURL(clear = false){
        const params = new URLSearchParams();
        if(!clear){
            const checkedValues = Array.from(checkbox)
                .filter(c => c.checked)
                .map(c => c.value);

            if(checkedValues.length > 0) params.set('filters', checkedValues.join(','));
            const sortVal = document.querySelector('.sort-model').value;
            if(sortVal) params.set('sort', sortVal);
        }

        const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
        window.history.replaceState({}, '', newUrl);
    }
});*/


