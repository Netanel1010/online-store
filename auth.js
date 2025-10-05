const signUpButton = document.getElementById('signUp');
const signInButton = document.getElementById('signIn');
const container = document.getElementById('container');

signUpButton.addEventListener('click', () => {
	container.classList.add("right-panel-active");
});

signInButton.addEventListener('click', () => {
	container.classList.remove("right-panel-active");
});


document.addEventListener('DOMContentLoaded' , ()=>{
    fetch('login.json')
    .then(res => res.json())
    .then(data => {  
        
        const formPage = document.querySelector('.form-page');

        const signUp = document.querySelector('.sign-up-container');
        const signIn = document.querySelector('.sign-in-container');
        
        const email = signIn.querySelector('.email');
        console.log(email)
        const password = signIn.querySelector('.psw'); 
        console.log(password)    
        const button = signIn.querySelector('.submit');
        console.log(button)

        const userCircle= document.querySelector('.svg-circle');
        const userPath = document.querySelector('.svg-path');
        

        // בדיקה אם כבר שמור משתמש ב-localStorage
        const savedUser = JSON.parse(localStorage.getItem("user"));
        if (savedUser) {
            container.innerHTML = '';
            userCircle.style.fill = "#00ff00";
            userPath.style.fill = "#00ff00";

            let connect = document.createElement('div');
            connect.classList.add('connect');
            let text = document.createElement('h2');
            text.innerText = `${savedUser.firstName} ${savedUser.lastName} is connect!`;
            let buttonDelet = document.createElement('button');
            buttonDelet.classList.add('disconnect');
            buttonDelet.textContent = 'לתנתק';

            buttonDelet.addEventListener('click' , ()=>{
                container.innerHTML = '';
                localStorage.removeItem('user');
                location.reload();
                const loginNameDiv = document.createElement('div');
                loginNameDiv.classList.add('login-name');

                const loginH1 = document.createElement('h1');
                loginH1.innerText = 'כניסה';

                loginNameDiv.appendChild(loginH1);
                container.appendChild(loginNameDiv);

                
                const emailLabel = document.createElement('label');
                emailLabel.setAttribute('for', 'email');
                emailLabel.innerText = 'אימייל';

                const emailInput = document.createElement('input');
                emailInput.classList.add('email');
                emailInput.type = 'email';
                emailInput.placeholder = 'אימייל';
                emailInput.required = true;

                container.appendChild(emailLabel);
                container.appendChild(emailInput);
                container.appendChild(document.createElement('br'));

                
                const passwordLabel = document.createElement('label');
                passwordLabel.setAttribute('for', 'psw');
                passwordLabel.innerText = 'סיסמה';

                const passwordInput = document.createElement('input');
                passwordInput.classList.add('psw');
                passwordInput.type = 'password';
                passwordInput.placeholder = 'סיסמה';
                passwordInput.required = true;

                container.appendChild(passwordLabel);
                container.appendChild(passwordInput);
                container.appendChild(document.createElement('br'));

                
                const forRemDiv = document.createElement('div');
                forRemDiv.classList.add('for-rem');

                const remLabel = document.createElement('label');
                const remCheckbox = document.createElement('input');
                remCheckbox.classList.add('remmember');
                remCheckbox.type = 'checkbox';
                remLabel.appendChild(remCheckbox);
                remLabel.append(' זכור אותי');

                const forgotLink = document.createElement('a');
                forgotLink.classList.add('forgot');
                forgotLink.href = '#';
                forgotLink.innerText = 'שחכתי סיסמה';

                forRemDiv.appendChild(remLabel);
                forRemDiv.appendChild(forgotLink);
                container.appendChild(forRemDiv);

                
                const loginEnterDiv = document.createElement('div');
                loginEnterDiv.classList.add('login-enter');

                const submitButton = document.createElement('button');
                submitButton.classList.add('submit');
                submitButton.innerText = 'כניסה';

                loginEnterDiv.appendChild(submitButton);
                container.appendChild(loginEnterDiv);


                const signupSpan = document.createElement('span');
                signupSpan.innerText = 'אין לך חשבון? ';

                const signupLink = document.createElement('a');
                signupLink.href = 'signup.html';
                signupLink.innerText = 'להירשם';

                signupSpan.appendChild(signupLink);
                container.appendChild(signupSpan);

            })
            connect.append(buttonDelet);
            connect.append(text);   
            container.append(connect);  
        }

        // האזנה ללחיצה על "כניסה"
        button.addEventListener('click' , (event)=>{
            event.preventDefault();
            const loginSubmit = data.find(user => user.email===email.value && user.password===password.value);

            if (loginSubmit) {
                // שמירה ב-localStorage
                localStorage.setItem("user", JSON.stringify(loginSubmit));

                container.innerHTML = '';
                userCircle.style.fill = "#00ff00";
                userPath.style.fill = "#00ff00";

                let connect = document.createElement('div');
                connect.classList.add('connect');
                let text = document.createElement('h2');
                text.innerText = `${loginSubmit.firstName} ${loginSubmit.lastName} is connect!`;
                connect.append(text);
                container.append(connect);  
            } else {
                console.log('email or password is not correct');
            }
        });
    })
    .catch(error => console.error(error))
});

