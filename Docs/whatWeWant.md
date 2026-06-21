We will be building an email campaign app for cold emailing to the lists i have prepared. I was earlier using a tool called mailmeteor but they have made some if the features paid so i have to make my own app.

The UI UX will be same like mailmeteor. The app will have the following features:

1. User Authentication: Users will be able to sign up and log in to their accounts securely. The permission to send emails will be taken when a user sign up. For now we will make it for me only in which i will give my google creds to maill send. In future we will make it for multiple users.

2. Campaign Management: 
In mailmeteor it was pretty simple. We click on new campaign we got the compose in which there was To: with option to select recepients. When click on that we got a popup to select multiple options like Import from google sheets, import a csv, contact list, copy paste. We will have the same options except contact list.
The google spreadsheet was most helpful. We have to enter spreadsheet url and then its sheets name will appear in which we have to choose the sheet we want to import.
The clicking on next will show the total recepints in the sheet in the same modal. Now we will add more options to it. See when we have a list lets say zomato. Then the sheet will have multiple columns like name, email, phone number, role. Now I will need to send recruiters at zomato a different mail and tech leads a different mail so the role column i can use to filter our the receipients. So when we choose a sheet we will show the columns in the sheet and then we can select the column which we want to use as filter. After that we will show the unique values in that column and then we can select the value which we want to filter out. This way we can send different mails to different roles in the same company. Then we click on next then the modal will show the total recepients after filtering and then we click on proceed the modal will be closed. Now the To field will show the total number of recipients after filtering.
Then there will be a subject field and a body field where we can compose the email. The body field will support rich text formatting and also allow us to insert placeholders for personalization, such as {{name}}, {{role}}, etc., which will be replaced with actual values from the selected sheet during sending. There will be multiple options like attach files.There will be options to remove all text formatting (because we dont want bold italic random text on job cold emails).
Then there will be an option on the right same like mailmeteor for show preview which when clicked will show the preview of the email with the actual values from the sheet with icons on the top for pc and mobile view. This way we can check how our email will look like before sending it. There will be one more option for send test email in which on our own email we can send a test email to check how it looks in our inbox.
then there will be a settings option where we can set the schedule time intervals between emails, track emails toggle on and off.

Now on the down on our mail there will be an option to add follow up emails. When we click on that we will get the same compose box where we can compose our follow up email. There will be an option to set the schedule time interval for follow up email as well. We can add multiple follow up emails as well. It will only for those recipients who have not replied to our previous email. The follow-up emails will also support rich text formatting and placeholders for personalization same like the main email.


Coming on the track ing option, we will have a dashboard where we can see the total number of emails sent, opened, clicked, replied, bounced. We will also have a list of all the recipients with their status like sent, opened, clicked, replied, bounced. We can also filter the recipients based on their status. 

On the campaign Tab on sidebar we will see all the campaigns and each campaigns details like total recipients, sent, opened, clicked, replied, bounced. We can also filter the campaigns based on their status like active, completed, paused.

When we click on a campaign we will see the details of that campaign like total recipients, sent, opened, clicked, replied, bounced. We will also see the list of all the recipients with their status like sent, opened, clicked, replied, bounced. We can also filter the recipients based on their status. We can also see the follow up emails for that campaign and their details like total recipients, sent, opened, clicked, replied, bounced.


Till now the features we have discussed are exact same like mailmeteor expect the filtering option which is a new feature we are adding. 

Now some more features which are customized for my use case:

1. I will be setting up campaigns for different companies and different roles. So I will need to have a feature where I can save the campaigns as templates. This way I can reuse the same campaign for different companies and roles without having to create it from scratch every time.

2. When a campaign is created then I will need to enter the name of the company which is optional. Next I will also need to enter the role for which I am sending the email. This way I can keep track of which campaign is for which company and role this will again will be optional. This will help me to keep track of the campaigns and also to filter the campaigns based on company and role.


Regarding the UI UX we will keep it same like in mailmeteor. I have attached images in Docs/designerAssests for reference. We will be using the same color scheme and layout as mailmeteor. The only difference will be the additional features we are adding like filtering and saving templates. We will also make sure that the app is responsive and works well on both desktop and mobile devices.

We will use MERN stack. For the frontend we will use React and for the backend we will use Node.js with Express. We will use MongoDB for the database to store user information, campaign details, recipient details, etc. We will also use a library like Nodemailer to send emails through Gmail SMTP server. We will also need to integrate with Google Sheets API to import recipients from Google Sheets. We will also need to implement authentication and authorization for users to securely access their accounts and campaigns. We will also need to implement a scheduler to send emails at the scheduled time intervals. We will also need to implement tracking for emails to track opens, clicks, replies, bounces, etc. We will also need to implement a dashboard to display the tracking data and campaign details.
Overall, this app will help me to manage my cold email campaigns more efficiently and effectively. It will save me time and effort in creating and managing campaigns, and also help me to track the performance of my campaigns and make data-driven decisions to improve them.
