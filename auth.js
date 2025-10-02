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
    
        const email = document.querySelector('.email');
        const password = document.querySelector('.psw'); 
        let userIcon = document.querySelector('.fa-user');
        const button = document.querySelector('.submit');
        const login = document.querySelector('.login');

        // בדיקה אם כבר שמור משתמש ב-localStorage
        const savedUser = JSON.parse(localStorage.getItem("user"));
        if (savedUser) {
            login.innerHTML = '';
            userIcon.style.color = "#00ff00";

            let connect = document.createElement('div');
            connect.classList.add('connect');
            let text = document.createElement('h2');
            text.innerText = `${savedUser.firstName} ${savedUser.lastName} is connect!`;
            let buttonDelet = document.createElement('button');
            buttonDelet.classList.add('disconnect');
            buttonDelet.textContent = 'לתנתק';

            buttonDelet.addEventListener('click' , ()=>{
                login.innerHTML = '';
                localStorage.removeItem('user');
                location.reload();
                const loginNameDiv = document.createElement('div');
                loginNameDiv.classList.add('login-name');

                const loginH1 = document.createElement('h1');
                loginH1.innerText = 'כניסה';

                loginNameDiv.appendChild(loginH1);
                login.appendChild(loginNameDiv);

                
                const emailLabel = document.createElement('label');
                emailLabel.setAttribute('for', 'email');
                emailLabel.innerText = 'אימייל';

                const emailInput = document.createElement('input');
                emailInput.classList.add('email');
                emailInput.type = 'email';
                emailInput.placeholder = 'אימייל';
                emailInput.required = true;

                login.appendChild(emailLabel);
                login.appendChild(emailInput);
                login.appendChild(document.createElement('br'));

                
                const passwordLabel = document.createElement('label');
                passwordLabel.setAttribute('for', 'psw');
                passwordLabel.innerText = 'סיסמה';

                const passwordInput = document.createElement('input');
                passwordInput.classList.add('psw');
                passwordInput.type = 'password';
                passwordInput.placeholder = 'סיסמה';
                passwordInput.required = true;

                login.appendChild(passwordLabel);
                login.appendChild(passwordInput);
                login.appendChild(document.createElement('br'));

                
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
                login.appendChild(forRemDiv);

                
                const loginEnterDiv = document.createElement('div');
                loginEnterDiv.classList.add('login-enter');

                const submitButton = document.createElement('button');
                submitButton.classList.add('submit');
                submitButton.innerText = 'כניסה';

                loginEnterDiv.appendChild(submitButton);
                login.appendChild(loginEnterDiv);


                const signupSpan = document.createElement('span');
                signupSpan.innerText = 'אין לך חשבון? ';

                const signupLink = document.createElement('a');
                signupLink.href = 'signup.html';
                signupLink.innerText = 'להירשם';

                signupSpan.appendChild(signupLink);
                login.appendChild(signupSpan);

            })
            connect.append(buttonDelet);
            connect.append(text);   
            login.append(connect);  
        }

        // האזנה ללחיצה על "כניסה"
        button.addEventListener('click' , (event)=>{
            event.preventDefault();
            const loginSubmit = data.find(user => user.email===email.value && user.password===password.value);

            if (loginSubmit) {
                // שמירה ב-localStorage
                localStorage.setItem("user", JSON.stringify(loginSubmit));

                login.innerHTML = '';
                userIcon.style.color = "#00ff00";

                let connect = document.createElement('div');
                connect.classList.add('connect');
                let text = document.createElement('h2');
                text.innerText = `${loginSubmit.firstName} ${loginSubmit.lastName} is connect!`;
                connect.append(text);
                login.append(connect);  
            } else {
                console.log('email or password is not correct');
            }
        });
    })
    .catch(error => console.error(error))
});

